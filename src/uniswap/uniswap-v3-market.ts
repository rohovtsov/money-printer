import { BigNumber, Contract } from 'ethers';
import {
  Address,
  bigIntAbs,
  CallData,
  EthMarket,
  MarketAction,
  UNISWAP_V3_POOL_ABI,
  WETH_ADDRESS,
} from '../entities';
import { NativePool } from './native-pool/native-pool';
import { FeeAmount, NativeTick, TickMath } from './native-pool/native-pool-utils';

export class UniswapV3Market implements EthMarket {
  static uniswapInterface = new Contract(WETH_ADDRESS, UNISWAP_V3_POOL_ABI);

  readonly protocol = 'uniswapV3';
  public pool?: NativePool;
  private cacheOut: Record<string, bigint | null> = {};

  constructor(
    readonly marketAddress: Address,
    readonly tokens: [Address, Address],
    readonly fee: number,
    readonly tickSpacing: number,
  ) {}

  calcTokensOut(action: MarketAction, amountIn: bigint): bigint | null {
    if (!this.pool) {
      return null;
    }

    const cacheKey = `${action}_${amountIn.toString()}`;
    if (!this.cacheOut.hasOwnProperty(cacheKey)) {
      try {
        const token = action === 'sell' ? this.tokens[0] : this.tokens[1];
        this.cacheOut[cacheKey] = this.pool.getOutputAmount(token, amountIn);
      } catch (e) {
        this.cacheOut[cacheKey] = null;
      }
    }

    return this.cacheOut[cacheKey];
  }

  calcTokensIn(action: MarketAction, amountOut: bigint): bigint | null {
    if (!this.pool) {
      return null;
    }

    try {
      const token = action === 'sell' ? this.tokens[0] : this.tokens[1];
      return this.pool.getInputAmount(token, amountOut);
    } catch (e) {
      return null;
    }
  }

  async performSwap(
    amountIn: bigint,
    action: MarketAction,
    recipient: string | EthMarket,
    data: string | [] = [],
  ): Promise<CallData> {
    // function swap(
    //     address recipient,
    //     bool zeroForOne,
    //     int256 amountSpecified,
    //     uint160 sqrtPriceLimitX96,
    //     bytes data
    //   ) external override noDelegateCall returns (int256 amount0, int256 amount1)
    // TODO КАЖЕТСЯ ПЕРВЫЙ V2 МАРКЕТ СКИДЫВАЕТ ДЕНЬГИ НА НЕ АДРЕСС КОНТРАКТА А НА АДРЕС СЛЕДУЮЩЕГО РЫНКА
    const toAddress = typeof recipient === 'string' ? recipient : recipient.marketAddress;
    const zeroForOne = action === 'sell';
    const MIN_SQRT_RATIO = BigNumber.from('4295128739');
    const MAX_SQRT_RATIO = BigNumber.from('1461446703485210103287273052203988822378723970342'); /// @dev The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)
    const sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_RATIO.add(1) : MAX_SQRT_RATIO.sub(1); // TODO FIXME как то надо это значение посчитать

    const populatedTransaction = await UniswapV3Market.uniswapInterface.populateTransaction.swap(
      toAddress,
      zeroForOne,
      bigIntAbs(amountIn),
      sqrtPriceLimitX96,
      data,
    );
    if (populatedTransaction === undefined || populatedTransaction.data === undefined) {
      throw new Error('Populated transaction is undefined');
    }
    return {
      data: populatedTransaction.data,
      target: this.marketAddress,
    };
  }

  hasLiquidity(): boolean {
    return !!this.pool && this.pool.liquidity > 0n && this.pool.sqrtRatioX96 > 0n;
  }

  isPoolStateDifferent(
    tick: number,
    sqrtPriceX96: bigint,
    liquidity: bigint,
    ticks: NativeTick[],
  ): boolean {
    if (
      !this.pool ||
      tick !== this.pool.tickCurrent ||
      sqrtPriceX96 !== this.pool.sqrtRatioX96 ||
      liquidity !== this.pool.liquidity ||
      ticks.length !== this.pool.ticks.length
    ) {
      return true;
    }

    for (let i = 0; i < ticks.length; i++) {
      const poolTick = this.pool.ticks[i];
      const newTick = ticks[i];

      if (poolTick.index !== newTick.index || poolTick.liquidityNet !== newTick.liquidityNet) {
        return true;
      }
    }

    return false;
  }

  setPoolState(tick: number, sqrtPriceX96: bigint, liquidity: bigint, ticks: NativeTick[]) {
    //TODO: ticks.length === 0 - still valid?
    this.cacheOut = {};
    try {
      this.pool = new NativePool(
        this.tokens[0],
        this.tokens[1],
        this.fee as FeeAmount,
        sqrtPriceX96,
        liquidity,
        tick,
        ticks,
      );
    } catch (e: any) {
      const isPriceBounds = !!e?.message?.includes('PRICE_BOUNDS');

      if (
        !isPriceBounds &&
        e?.message?.includes('ZERO_NET') &&
        this.pool?.ticks?.[0]?.index === TickMath.MIN_TICK &&
        ticks?.[0]?.index !== TickMath.MIN_TICK
      ) {
        //если не хватает первого тика под номером TickMath.MIN_TICK, и если он был раньше, то поставим его на место.
        this.setPoolState(tick, sqrtPriceX96, liquidity, [
          new NativeTick(
            this.pool!.ticks[0]!.index,
            this.pool!.ticks[0]!.liquidityGross,
            this.pool!.ticks[0]!.liquidityNet,
          ),
          ...ticks,
        ]);
        return;
      }

      if (!isPriceBounds) {
        console.error(e);
      }

      this.pool = undefined;
    }
  }
}

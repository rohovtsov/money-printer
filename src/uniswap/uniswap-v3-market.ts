import { ChainId, JSBI } from '@uniswap/sdk';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { FeeAmount, Tick } from '@uniswap/v3-sdk';
import { BigNumber, Contract } from 'ethers';
import {
  Address,
  CallData,
  EthMarket,
  MarketAction,
  UNISWAP_V3_POOL_ABI,
  WETH_ADDRESS,
} from '../entities';
import { AdvancedPool } from './uniswap-v3-sdk-advanced-pool';

export class UniswapV3Market implements EthMarket {
  static uniswapInterface = new Contract(WETH_ADDRESS, UNISWAP_V3_POOL_ABI);

  readonly protocol = 'uniswapV3';
  public sqrtPrice?: BigNumber;
  public tick?: number;
  public pool?: AdvancedPool;
  private readonly poolToken0: Token;
  private readonly poolToken1: Token;

  constructor(
    readonly marketAddress: Address,
    readonly tokens: [Address, Address],
    readonly fee: number,
    readonly tickSpacing: number,
  ) {
    this.poolToken0 = new Token(ChainId.MAINNET, this.tokens[0], 0);
    this.poolToken1 = new Token(ChainId.MAINNET, this.tokens[1], 0);
  }

  public hasEnoughReserves(tokenAddress: string, minReserve: BigNumber): boolean {
    throw new Error('Method not implemented.');
  }

  calcTokensOut(action: MarketAction, amountIn: BigNumber): BigNumber | null {
    if (!this.pool) {
      return null;
    }

    try {
      const token = action === 'sell' ? this.poolToken0 : this.poolToken1;
      return BigNumber.from(
        this.pool
          .getOutputAmountSync(
            CurrencyAmount.fromRawAmount(token, JSBI.BigInt(amountIn.toString())),
          )[0]
          .toSignificant(100),
      );
    } catch (e) {
      return null;
    }
  }

  calcTokensIn(action: MarketAction, amountOut: BigNumber): BigNumber | null {
    if (!this.pool) {
      return null;
    }

    try {
      const token = action === 'sell' ? this.poolToken0 : this.poolToken1;
      return BigNumber.from(
        this.pool
          .getInputAmountSync(
            CurrencyAmount.fromRawAmount(token, JSBI.BigInt(amountOut.toString())),
          )[0]
          .toSignificant(100),
      );
    } catch (e) {
      return null;
    }
  }

  async performSwap(
    amountIn: BigNumber,
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
      amountIn.abs(),
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

  setPoolState(tick: number, sqrtPriceX96: BigNumber, liquidity: BigNumber, ticks: Tick[]) {
    try {
      this.pool = new AdvancedPool(
        this.poolToken0,
        this.poolToken1,
        this.fee as FeeAmount,
        JSBI.BigInt(sqrtPriceX96.toString()),
        JSBI.BigInt(liquidity.toString()),
        tick,
        ticks,
      );
    } catch (e: any) {
      if (!e?.message?.includes('PRICE_BOUNDS')) {
        console.error(e);
      }
      this.pool = undefined;
    }
  }
}

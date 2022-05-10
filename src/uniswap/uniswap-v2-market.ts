import { BigNumber, Contract } from 'ethers';
import {
  Address,
  CallData,
  EthMarket,
  MarketAction,
  PriceCalculator,
  UNISWAP_V2_PAIR_ABI,
  WETH_ADDRESS,
} from '../entities';
import { SimpleUniswapV2Calculator } from './uniswap-v2-price-calculator';

export class UniswapV2Market implements EthMarket {
  static uniswapInterface = new Contract(WETH_ADDRESS, UNISWAP_V2_PAIR_ABI);

  readonly protocol = 'uniswapV2';
  readonly calculator: PriceCalculator;
  private reserves?: [BigNumber, BigNumber];
  private cacheOut: Record<string, BigNumber | null> = {};

  public hasEnoughReserves(tokenAddress: string, minReserve: BigNumber): boolean {
    if (!this.reserves) {
      return false;
    }
    return this.reserves[this.tokens.indexOf(tokenAddress)].gt(minReserve);
  }

  constructor(readonly marketAddress: Address, readonly tokens: [Address, Address]) {
    this.calculator = SimpleUniswapV2Calculator;
  }

  calcTokensOut(action: MarketAction, amountIn: BigNumber): BigNumber | null {
    if (!this.reserves) {
      console.log(this.marketAddress);
      throw new Error('Reserves not supplied');
    }

    const cacheKey = `${action}_${amountIn.toString()}`;
    if (!this.cacheOut.hasOwnProperty(cacheKey)) {
      const reservesIn = action === 'sell' ? this.reserves[0] : this.reserves[1];
      const reservesOut = action === 'sell' ? this.reserves[1] : this.reserves[0];

      this.cacheOut[cacheKey] =
        reservesIn < amountIn
          ? null
          : this.calculator.getTokensOut(reservesIn, reservesOut, amountIn);
    }

    return this.cacheOut[cacheKey];
  }

  calcTokensIn(action: MarketAction, amountOut: BigNumber): BigNumber | null {
    if (!this.reserves) {
      throw new Error('Reserves not supplied');
    }

    const reservesIn = action === 'sell' ? this.reserves[0] : this.reserves[1];
    const reservesOut = action === 'sell' ? this.reserves[1] : this.reserves[0];

    return reservesOut > amountOut
      ? null
      : this.calculator.getTokensIn(reservesIn, reservesOut, amountOut);
  }

  async performSwap(
    amountIn: BigNumber,
    action: MarketAction,
    recipient: string | EthMarket,
    data: string | [] = [],
  ): Promise<CallData> {
    // function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external lock {
    const toAddress = typeof recipient === 'string' ? recipient : recipient.marketAddress;
    let amount0Out = action === 'sell' ? BigNumber.from(0) : this.calcTokensOut(action, amountIn);
    let amount1Out = action === 'sell' ? this.calcTokensOut(action, amountIn) : BigNumber.from(0);

    const populatedTransaction = await UniswapV2Market.uniswapInterface.populateTransaction.swap(
      amount0Out,
      amount1Out,
      toAddress,
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

  setTokenReserves(reserves1: BigNumber, reserves2: BigNumber): void {
    this.reserves = [reserves1, reserves2];
    this.cacheOut = {};
  }
}

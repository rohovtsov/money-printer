import { BigNumber } from 'ethers';
import { Address, CallData, EthMarket, MarketAction, PriceCalculator } from '../entities';
import { SimpleUniswapV2Calculator } from './uniswap-v2-price-calculator';

export class UniswapV2Market implements EthMarket {
  readonly protocol = 'uniswapV2';
  readonly calculator: PriceCalculator;
  private reserves?: [BigNumber, BigNumber];

  constructor(
    readonly marketAddress: Address,
    readonly tokens: [Address, Address],
  ) {
    this.calculator = SimpleUniswapV2Calculator;
  }

  calcTokensOut(action: MarketAction, amountIn: BigNumber): BigNumber | null {
    if (!this.reserves) {
      throw new Error('Reserves not supplied');
    }

    const reservesIn = action === 'sell' ? this.reserves[0] : this.reserves[1];
    const reservesOut = action === 'sell' ? this.reserves[1] : this.reserves[0];

    return this.calculator.getTokensOut(reservesIn, reservesOut, amountIn);
  }

  calcTokensIn(action: MarketAction, amountOut: BigNumber): BigNumber | null {
    if (!this.reserves) {
      throw new Error('Reserves not supplied');
    }

    const reservesIn = action === 'sell' ? this.reserves[0] : this.reserves[1];
    const reservesOut = action === 'sell' ? this.reserves[1] : this.reserves[0];

    return this.calculator.getTokensIn(reservesIn, reservesOut, amountOut);
  }

  performSwap(amount: BigNumber, action: MarketAction): Promise<CallData> {
    throw new Error('Method not implemented.');
  }

  setTokenReserves(reserves1: BigNumber, reserves2: BigNumber): void {
    this.reserves = [reserves1, reserves2];
  }
}

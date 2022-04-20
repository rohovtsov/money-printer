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

  calculateSwap(amount: BigNumber, action: MarketAction): BigNumber {
    if (!this.reserves) {
      throw new Error('Reserves not supplied');
    }

    if (action === 'sell') {
      return this.calculator.getTokensOut(this.reserves[0], this.reserves[1], amount);
    } else {
      return this.calculator.getTokensIn(this.reserves[1], this.reserves[0], amount);
    }
  }

  performSwap(amount: BigNumber, action: MarketAction): Promise<CallData> {
    throw new Error('Method not implemented.');
  }

  setTokenReserves(reserves1: BigNumber, reserves2: BigNumber): void {
    this.reserves = [reserves1, reserves2];
  }
}

import { BigNumber } from 'ethers';
import { Address, CallData, ETHER, EthMarket, MarketAction, PriceCalculator } from '../entities';
import { SimpleUniswapV2Calculator } from './uniswap-v2-price-calculator';

export class UniswapV3Market implements EthMarket {
  readonly protocol = 'uniswapV3';
  readonly calculator: PriceCalculator;

  constructor(
    readonly marketAddress: Address,
    readonly tokens: [Address, Address],
    readonly fee: number,
    readonly tickSpacing: number,
  ) {
    this.calculator = SimpleUniswapV2Calculator;
  }

  calcTokensOut(action: MarketAction, amountIn: BigNumber): BigNumber | null {
    return this.calculator.getTokensOut(ETHER, ETHER, amountIn);
  }

  calcTokensIn(action: MarketAction, amountOut: BigNumber): BigNumber | null {
    return this.calculator.getTokensIn(ETHER, ETHER, amountOut);
  }

  performSwap(amount: BigNumber, action: MarketAction): Promise<CallData> {
    throw new Error('Method not implemented.');
  }
}

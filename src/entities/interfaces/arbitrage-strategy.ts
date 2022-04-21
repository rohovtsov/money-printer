import { Address, EthMarket, MarketAction } from './eth-market';
import { BigNumber } from 'ethers';

export type ArbitrageStrategyName = 'triangle';

export interface ArbitrageOperation {
  market: EthMarket;
  amountIn: BigNumber;
  amountOut: BigNumber;
  action: MarketAction;
}

export interface ArbitrageOpportunity {
  strategyName: ArbitrageStrategyName;
  operations: ArbitrageOperation[];
  startToken: Address;
  profit: BigNumber;
}

export interface ArbitrageStrategy {
  getArbitrageOpportunities(changedMarkets: EthMarket[], allMarkets: EthMarket[]): ArbitrageOpportunity[];
}

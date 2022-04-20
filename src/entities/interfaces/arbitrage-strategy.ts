import { EthMarket, MarketAction } from './eth-market';
import { BigNumber } from 'ethers';

export type ArbitrageStrategyName = 'triangle';

export interface ArbitrageAction {
  market: EthMarket[];
  amountIn: BigNumber;
  amountOut: BigNumber;
  action: MarketAction;
}

export interface ArbitrageOpportunity {
  strategyName: ArbitrageStrategyName;
  actions: ArbitrageAction[];
  profitEth: BigNumber;
}

export interface ArbitrageStrategy {
  getArbitrageOpportunities(changedMarkets: EthMarket[], allMarkets: EthMarket[]): ArbitrageOpportunity[];
}

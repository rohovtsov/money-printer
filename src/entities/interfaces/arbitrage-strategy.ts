import { Address, EthMarket, MarketAction } from './eth-market';
import { BigNumber } from 'ethers';

export type ArbitrageStrategyName = 'uniswap-v2' | 'fixed-amount';

export interface ArbitrageOperation {
  market: EthMarket;
  amountIn: bigint;
  amountOut: bigint;
  action: MarketAction;
  tokenIn: Address;
  tokenOut: Address;
}

export interface ArbitrageOpportunity {
  blockNumber: number;
  blockReceivedAt?: number;
  strategyName: ArbitrageStrategyName;
  operations: ArbitrageOperation[];
  startToken: Address;
  profit: bigint;
}

export interface ArbitrageStrategy {
  getArbitrageOpportunities(
    changedMarkets: EthMarket[],
    allMarkets: EthMarket[],
    blockNumber: number,
  ): ArbitrageOpportunity[];
}

export function sortOpportunitiesByProfit<T extends ArbitrageOpportunity>(opportunities: T[]): T[] {
  return opportunities.sort((a, b) => (a.profit < b.profit ? 1 : a.profit > b.profit ? -1 : 0));
}

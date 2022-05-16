import { Address, EthMarket, MarketAction } from './eth-market';
import { BigNumber } from 'ethers';

export type ArbitrageStrategyName = 'triangle';

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

import { EthMarket, Protocol } from './eth-market';

export interface EthMarketSyncer<T extends EthMarket> {
  protocol: Protocol;

  sync(changedMarkets: T[], blockNumber: number): Promise<void>;
}

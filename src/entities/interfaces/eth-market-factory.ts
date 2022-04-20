import { EthMarket } from './eth-market';

export interface EthMarketFactory {
  getEthMarkets(): Promise<EthMarket[]>;
}

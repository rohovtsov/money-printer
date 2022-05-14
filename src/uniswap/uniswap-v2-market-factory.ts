import {
  Address,
  EthMarketFactory,
  PairCreatedEvent,
  parsePairCreatedLog,
  UNISWAP_PAIR_CREATED_EVENT_TOPIC,
} from '../entities';
import { UniswapV2Market } from './uniswap-v2-market';
import { providers } from 'ethers';
import { LogsCache } from '../entities/logs-cache';

export class UniswapV2MarketFactory implements EthMarketFactory {
  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly factoryAddress: Address,
    readonly toBlock: number,
  ) {}

  async getEthMarkets(): Promise<UniswapV2Market[]> {
    const cache = new LogsCache(this.provider, {
      topics: [UNISWAP_PAIR_CREATED_EVENT_TOPIC],
      address: this.factoryAddress,
    });

    const pack = await cache.getLogsRegressive(this.toBlock);

    return pack.logs.map((log) => {
      const event = parsePairCreatedLog(log) as PairCreatedEvent;
      return new UniswapV2Market(event.pair, [event.token0, event.token1]);
    });
  }
}

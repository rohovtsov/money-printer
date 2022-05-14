import {
  Address,
  EthMarketFactory,
  parsePoolCreatedLog,
  PoolCreatedEvent,
  UNISWAP_POOL_CREATED_EVENT_TOPIC,
} from '../entities';
import { providers } from 'ethers';
import { UniswapV3Market } from './uniswap-v3-market';
import { LogsCache } from '../entities/logs-cache';

export class UniswapV3MarketFactory implements EthMarketFactory {
  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly factoryAddress: Address,
    readonly toBlock: number,
  ) {}

  async getEthMarkets(): Promise<UniswapV3Market[]> {
    const cache = new LogsCache(this.provider, {
      topics: [UNISWAP_POOL_CREATED_EVENT_TOPIC],
      address: this.factoryAddress,
    });

    const pack = await cache.getLogsRegressive(this.toBlock);

    return pack.logs.map((log) => {
      const event = parsePoolCreatedLog(log) as PoolCreatedEvent;
      return new UniswapV3Market(
        event.pool,
        [event.token0, event.token1],
        event.fee,
        event.tickSpacing,
      );
    });
  }
}

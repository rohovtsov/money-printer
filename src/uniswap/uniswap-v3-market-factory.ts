import {
  Address,
  EthMarketFactory,
  getLogsRegressive,
  mergeLogPacks,
  parsePoolCreatedLog,
  PoolCreatedEvent,
  UNISWAP_POOL_CREATED_EVENT_TOPIC,
} from '../entities';
import { providers } from 'ethers';
import { UniswapV3Market } from './uniswap-v3-market';
import { lastValueFrom } from 'rxjs';

export class UniswapV3MarketFactory implements EthMarketFactory {
  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly factoryAddress: Address,
    readonly toBlock: number,
  ) { }

  async getEthMarkets(): Promise<UniswapV3Market[]> {
    const pack = await lastValueFrom(getLogsRegressive(this.provider, {
      fromBlock: 0,
      toBlock: this.toBlock,
      topics: [
        UNISWAP_POOL_CREATED_EVENT_TOPIC
      ],
      address: this.factoryAddress
    }).pipe(mergeLogPacks()));

    return pack.logs.map(log => {
      const event = parsePoolCreatedLog(log) as PoolCreatedEvent;
      return new UniswapV3Market(event.pool, [event.token0, event.token1], event.fee, event.tickSpacing);
    });
  }
}

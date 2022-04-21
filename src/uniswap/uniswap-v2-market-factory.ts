import {
  Address,
  EthMarketFactory, getLogsRegressive, mergeLogPacks, PairCreatedEvent, parsePairCreatedLog,
  UNISWAP_PAIR_CREATED_EVENT_TOPIC,
} from '../entities';
import { UniswapV2Market } from './uniswap-v2-market';
import { providers } from 'ethers';
import { lastValueFrom } from 'rxjs';

export class UniswapV2MarketFactory implements EthMarketFactory {
  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly factoryAddress: Address,
    readonly toBlock: number,
  ) { }

  async getEthMarkets(): Promise<UniswapV2Market[]> {
    const pack = await lastValueFrom(getLogsRegressive(this.provider, {
      fromBlock: 0,
      toBlock: this.toBlock,
      topics: [
        UNISWAP_PAIR_CREATED_EVENT_TOPIC
      ],
      address: this.factoryAddress
    }).pipe(mergeLogPacks()));

    return pack.logs.map(log => {
      const event = parsePairCreatedLog(log) as PairCreatedEvent;
      return new UniswapV2Market(event.pair, [event.token0, event.token1]);
    });
  }
}

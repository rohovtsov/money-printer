import { providers } from 'ethers';
import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy, endTime,
  EthMarket,
  fromProviderEvent, printOpportunity, startTime, UNISWAP_POOL_EVENT_TOPICS,
  UNISWAP_SYNC_EVENT_TOPIC
} from './entities';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV2Market } from './uniswap/uniswap-v2-market';
import { concatMap, from, map, Observable, startWith, tap } from 'rxjs';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';



export class ArbitrageRunner {
  readonly marketsByAddress: Record<Address, EthMarket>;

  constructor(
    readonly markets: EthMarket[],
    readonly strategies: ArbitrageStrategy[],
    readonly uniswapV2Syncer: UniswapV2ReservesSyncer,
    readonly uniswapV3Syncer: UniswapV3PoolStateSyncer,
    readonly provider: providers.JsonRpcProvider,
  ) {
    this.marketsByAddress = this.markets.reduce((acc, market) => {
      acc[market.marketAddress] = market;
      return acc;
    }, {} as Record<Address, EthMarket>)
  }

  start(): Observable<ArbitrageOpportunity[]> {
    //TODO: sync reserves isn't synchronized with blockNumber.

    return fromProviderEvent<number>(this.provider, 'block').pipe(
      startWith(null),
      tap((blockNumber) => {
        console.log(`Block received: ${blockNumber ?? 'initial'}`);
      }),
      concatMap((blockNumber: number | null) => from((async () => {
        const changedMarkets = blockNumber ? await loadChangedEthMarkets(this.provider, blockNumber, this.marketsByAddress) : this.markets;
        const uniswapV2Markets = changedMarkets.filter(market => market.protocol === 'uniswapV2') as UniswapV2Market[];
        const uniswapV3Markets = changedMarkets.filter(market => market.protocol === 'uniswapV3') as UniswapV3Market[];
        await Promise.all([
          this.uniswapV2Syncer.syncReserves(uniswapV2Markets),
          this.uniswapV3Syncer.syncPoolStates(uniswapV3Markets, blockNumber ?? 0),
        ])
        return changedMarkets;
      })())),
      map((changedMarkets: EthMarket[]) => {
        startTime('render');
        return this.runStrategies(changedMarkets);
      }),
      tap((opportunities) => {
        console.log(`Found opportunities: ${opportunities.length} in ${endTime('render')}ms\n`)
        opportunities.slice(0, 5).forEach(printOpportunity);
      }),
    );
  }

  runStrategies(changedMarkets: EthMarket[]): ArbitrageOpportunity[] {
    return this.strategies
      .reduce((acc, strategy) => {
        const opportunities = strategy.getArbitrageOpportunities(changedMarkets, this.markets);
        acc.push(...opportunities);
        return acc;
      }, [] as ArbitrageOpportunity[])
      .sort((a, b) => a.profit.lt(b.profit) ? 1 : a.profit.gt(b.profit) ? -1 : 0);
  }
}


function loadChangedEthMarkets(
  provider: providers.JsonRpcProvider, blockNumber: number, marketsByAddress: Record<Address, EthMarket>
): Promise<EthMarket[]> {
  const indicatorTopics = new Set<string>([...UNISWAP_POOL_EVENT_TOPICS, UNISWAP_SYNC_EVENT_TOPIC]);

  return provider.getLogs({
    fromBlock: blockNumber,
    toBlock: blockNumber,
  }).then(logs => {
    const changedAddresses = logs
      .filter(log => log.topics.some(topic => indicatorTopics.has(topic)))
      .map(log => log.address);

    return changedAddresses.reduce((acc, address) => {
      if (marketsByAddress[address]) {
        acc.push(marketsByAddress[address]);
      }
      return acc;
    }, [] as EthMarket[]);
  });
}

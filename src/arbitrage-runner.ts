import { providers } from 'ethers';
import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  endTime,
  EthMarket,
  fromProviderEvent,
  printOpportunity,
  startTime,
  UNISWAP_POOL_EVENT_TOPICS,
  UNISWAP_SYNC_EVENT_TOPIC,
} from './entities';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV2Market } from './uniswap/uniswap-v2-market';
import {
  BehaviorSubject,
  combineLatest,
  concatMap,
  delay,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';

interface SyncEvent {
  changedMarkets: EthMarket[];
  blockNumber: number;
  initial?: boolean;
}

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
    }, {} as Record<Address, EthMarket>);
  }

  startSync(): Observable<SyncEvent> {
    const currentBlock$ = merge(
      fromProviderEvent<number>(this.provider, 'block'),
      from(this.provider.getBlockNumber()),
    ).pipe(
      distinctUntilChanged(),
      tap((blockNumber) => {
        console.log(`New block: ${blockNumber}`);
      }),
      shareReplay(),
    );

    const currentChangedMarkets$: Observable<SyncEvent> = currentBlock$.pipe(
      concatMap((blockNumber: number, index) => {
        if (index === 0) {
          return of({
            changedMarkets: this.markets,
            initial: true,
            blockNumber,
          });
        }

        return from(loadChangedEthMarkets(this.provider, blockNumber, this.marketsByAddress)).pipe(
          map((markets) => ({
            changedMarkets: markets,
            blockNumber,
          })),
        );
      }),
    );

    //TODO: buffer changed markets while sync is in progress.
    const syncedChangedMarkets$ = currentChangedMarkets$.pipe(
      concatMap((event) => {
        return from(this.syncMarkets(event.changedMarkets, event.blockNumber)).pipe(
          map(() => event),
        );
      }),
    );

    const changedMarkets = new Set<EthMarket>();
    return combineLatest([currentBlock$, syncedChangedMarkets$]).pipe(
      filter(([currentBlock, event]) => {
        for (const market of event.changedMarkets) {
          changedMarkets.add(market);
        }

        if (event.blockNumber < currentBlock) {
          console.log(
            `Buffered ${event.changedMarkets.length} changed markets, buffer size: ${changedMarkets.size}`,
          );
        }

        return event.blockNumber >= currentBlock;
      }),
      map(([, event]) => {
        const result = {
          ...event,
          changedMarkets: Array.from(changedMarkets),
        };
        changedMarkets.clear();
        return result;
      }),
    );
  }

  start(): Observable<ArbitrageOpportunity[]> {
    return this.startSync().pipe(
      map((event: SyncEvent) => {
        startTime('render');
        console.log(`Changed markets: ${event.changedMarkets.length} in ${event.blockNumber}`);
        return this.runStrategies(event.changedMarkets);
      }),
    );
  }

  async syncMarkets(markets: EthMarket[], minBlockNumber: number): Promise<void> {
    const uniswapV2Markets = markets.filter(
      (market) => market.protocol === 'uniswapV2',
    ) as UniswapV2Market[];
    const uniswapV3Markets = markets.filter(
      (market) => market.protocol === 'uniswapV3',
    ) as UniswapV3Market[];
    await Promise.all([
      this.uniswapV2Syncer.syncReserves(uniswapV2Markets),
      this.uniswapV3Syncer.syncPoolStates(uniswapV3Markets, minBlockNumber),
    ]);
  }

  runStrategies(changedMarkets: EthMarket[]): ArbitrageOpportunity[] {
    return this.strategies
      .reduce((acc, strategy) => {
        const opportunities = strategy.getArbitrageOpportunities(changedMarkets, this.markets);
        acc.push(...opportunities);
        return acc;
      }, [] as ArbitrageOpportunity[])
      .sort((a, b) => (a.profit.lt(b.profit) ? 1 : a.profit.gt(b.profit) ? -1 : 0));
  }
}

function loadChangedEthMarkets(
  provider: providers.JsonRpcProvider,
  blockNumber: number,
  marketsByAddress: Record<Address, EthMarket>,
): Promise<EthMarket[]> {
  const indicatorTopics = new Set<string>([...UNISWAP_POOL_EVENT_TOPICS, UNISWAP_SYNC_EVENT_TOPIC]);

  return provider
    .getLogs({
      fromBlock: blockNumber,
      toBlock: blockNumber,
    })
    .then((logs) => {
      const changedAddresses = logs
        .filter((log) => log.topics.some((topic) => indicatorTopics.has(topic)))
        .map((log) => log.address);

      return changedAddresses.reduce((acc, address) => {
        if (marketsByAddress[address]) {
          acc.push(marketsByAddress[address]);
        }
        return acc;
      }, [] as EthMarket[]);
    });
}

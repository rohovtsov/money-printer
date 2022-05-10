import { BigNumber, providers } from 'ethers';
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
  bufferWhen,
  combineLatest,
  concatMap,
  defer,
  delay,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  interval,
  map,
  merge,
  Observable,
  of,
  race,
  shareReplay,
  startWith,
  Subject,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import { retry } from 'rxjs/operators';

interface SyncEvent {
  changedMarkets: EthMarket[];
  blockNumber: number;
  initial: boolean;
}

interface ArbitrageEvent {
  opportunities: ArbitrageOpportunity[];
  blockNumber: number;
}

export class ArbitrageRunner {
  private queuedOpportunities: ArbitrageOpportunity[] = [];
  readonly marketsByAddress: Record<Address, EthMarket>;
  readonly currentBlock$: Observable<number>;

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

    let id = 0;
    this.currentBlock$ = merge(
      fromProviderEvent<number>(this.provider, 'block'),
      from(this.provider.getBlockNumber()),
    ).pipe(
      distinctUntilChanged(),
      tap((blockNumber) => {
        console.log(`${id++ === 0 ? 'Initial block' : 'New block'}: ${blockNumber}`);
      }),
      shareReplay(1),
    );
  }

  private startSync(): Observable<SyncEvent> {
    const currentBlock$ = this.currentBlock$;

    const changedMarkets$: Observable<SyncEvent> = currentBlock$.pipe(
      concatMap((blockNumber: number, index): Observable<SyncEvent> => {
        if (index === 0) {
          return of({
            changedMarkets: this.markets,
            initial: true,
            blockNumber,
          });
        }

        return defer(() =>
          loadChangedEthMarkets(this.provider, blockNumber, this.marketsByAddress),
        ).pipe(
          retry(5),
          map((changedMarkets) => ({
            changedMarkets,
            initial: false,
            blockNumber,
          })),
        );
      }),
    );

    //TODO: buffer changed markets while sync is in progress.
    const syncedChangedMarkets$ = changedMarkets$.pipe(
      concatMap((changedEvent) => {
        const queuedMarkets = this.retrieveQueuedMarketsAndEmptyQueue();
        const changedMarkets = mergeMarkets(queuedMarkets, changedEvent.changedMarkets);
        const event = { ...changedEvent, changedMarkets };

        return from(this.syncMarkets(changedMarkets, event.blockNumber)).pipe(map(() => event));
      }),
    );

    const changedMarketsBuffer = new Set<EthMarket>();
    return syncedChangedMarkets$.pipe(
      switchMap((event) => {
        return currentBlock$.pipe(
          switchMap((currentBlock) => {
            for (const market of event.changedMarkets) {
              changedMarketsBuffer.add(market);
            }

            if (event.blockNumber < currentBlock) {
              console.log(
                `Buffered ${event.changedMarkets.length} changed markets, buffer size: ${changedMarketsBuffer.size} - at block: ${event.blockNumber}/${currentBlock}`,
              );
              return EMPTY;
            } else {
              const result = {
                ...event,
                changedMarkets: Array.from(changedMarketsBuffer),
              };
              changedMarketsBuffer.clear();
              return of(result);
            }
          }),
          take(1),
        );
      }),
    );
  }

  start(): Observable<ArbitrageEvent> {
    return this.startSync().pipe(
      map((event: SyncEvent) => {
        startTime('render');
        console.log(`Changed markets: ${event.changedMarkets.length} in ${event.blockNumber}`);
        return {
          opportunities: this.runStrategies(event.changedMarkets, event.blockNumber),
          blockNumber: event.blockNumber,
        };
      }),
    );
  }

  queueOpportunity(opportunity: ArbitrageOpportunity) {
    console.log(`Queued opportunity`);
    this.queuedOpportunities.push(opportunity);
  }

  private retrieveQueuedMarketsAndEmptyQueue(): EthMarket[] {
    const markets = new Set<EthMarket>([]);

    for (const opportunity of this.queuedOpportunities) {
      for (const operation of opportunity.operations) {
        markets.add(operation.market);
      }
    }

    console.log(
      `Retrieved from queue: ${this.queuedOpportunities.length} opportunities, that has ${markets.size} changed markets`,
    );
    this.queuedOpportunities = [];
    return Array.from(markets);
  }

  private async syncMarkets(markets: EthMarket[], minBlockNumber: number): Promise<void> {
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

  private runStrategies(changedMarkets: EthMarket[], blockNumber: number): ArbitrageOpportunity[] {
    return this.strategies
      .reduce((acc, strategy) => {
        const opportunities = strategy.getArbitrageOpportunities(
          changedMarkets,
          this.markets,
          blockNumber,
        );
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

export function filterCorrelatingOpportunities(
  opportunities: ArbitrageOpportunity[],
): ArbitrageOpportunity[] {
  const usedMarkets = new Set<string>([]);

  return opportunities.filter((opportunity) => {
    for (const operation of opportunity.operations) {
      const { marketAddress } = operation.market;

      if (usedMarkets.has(marketAddress)) {
        return false;
      } else {
        usedMarkets.add(marketAddress);
      }
    }

    return true;
  });
}

function mergeMarkets(marketsA: EthMarket[], marketsB: EthMarket[]): EthMarket[] {
  const uniqueMarkets = new Set<EthMarket>([]);

  for (const market of marketsA) {
    uniqueMarkets.add(market);
  }

  for (const market of marketsB) {
    uniqueMarkets.add(market);
  }

  return Array.from(uniqueMarkets);
}

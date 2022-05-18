import { providers } from 'ethers';
import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  calcBaseFeePerGas,
  canCalcBaseFeePerGas,
  endTime,
  EthMarket,
  getBaseFeePerGas,
  raceGetLogs,
  startTime,
  UNISWAP_POOL_EVENT_TOPICS,
  UNISWAP_SYNC_EVENT_TOPIC,
} from './entities';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV2Market } from './uniswap/uniswap-v2-market';
import {
  concatMap,
  defer,
  distinctUntilChanged,
  EMPTY,
  from,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  take,
} from 'rxjs';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import { retry } from 'rxjs/operators';
import { UniswapV3PoolStateSyncerContractQuery } from './uniswap/uniswap-v3-pool-state-syncer-contract-query';

interface SyncEvent {
  changedMarkets: EthMarket[];
  baseFeePerGas: bigint;
  blockNumber: number;
  blockReceivedAt: number;
  initial: boolean;
}

interface NewBlockEvent {
  nextBaseFeePerGas: bigint;
  blockNumber: number;
  blockReceivedAt: number;
}

interface ArbitrageEvent {
  opportunities: ArbitrageOpportunity[];
  baseFeePerGas: bigint;
  blockNumber: number;
  blockReceivedAt: number;
}

export class ArbitrageRunner {
  private queuedOpportunities: ArbitrageOpportunity[] = [];
  readonly marketsByAddress: Record<Address, EthMarket>;
  private newBlocks$: Observable<NewBlockEvent>;
  readonly currentBlockNumber$: Observable<number>;

  constructor(
    readonly markets: EthMarket[],
    readonly strategies: ArbitrageStrategy[],
    readonly uniswapV2Syncer: UniswapV2ReservesSyncer,
    readonly uniswapV3Syncer: UniswapV3PoolStateSyncerContractQuery,
    readonly hostProvider: providers.WebSocketProvider,
    readonly providersForRace: providers.JsonRpcProvider[] = [],
  ) {
    this.marketsByAddress = this.markets.reduce((acc, market) => {
      acc[market.marketAddress] = market;
      return acc;
    }, {} as Record<Address, EthMarket>);

    this.newBlocks$ = fromNewBlockEvent(this.hostProvider).pipe(
      distinctUntilChanged((prev, current) => prev.blockNumber === current.blockNumber),
      shareReplay(1),
    );
    this.currentBlockNumber$ = this.newBlocks$.pipe(
      take(1),
      map((block) => block.blockNumber),
    );
  }

  private startSync(): Observable<SyncEvent> {
    const changedMarkets$: Observable<SyncEvent> = this.newBlocks$.pipe(
      concatMap((event: NewBlockEvent, index: number): Observable<SyncEvent> => {
        if (index === 0) {
          return of({
            changedMarkets: this.markets,
            baseFeePerGas: event.nextBaseFeePerGas,
            blockReceivedAt: event.blockReceivedAt,
            blockNumber: event.blockNumber,
            initial: true,
          });
        }

        startTime('changedMarkets');
        return defer(() =>
          loadChangedEthMarkets(
            this.hostProvider,
            this.providersForRace,
            event.blockNumber,
            this.marketsByAddress,
          ),
        )
          .pipe(retry(5))
          .pipe(
            map((changedMarkets: EthMarket[]) => {
              console.log(
                `Loaded ${changedMarkets.length} changed markets in ${endTime(
                  'changedMarkets',
                )}ms at ${event.blockNumber}`,
              );
              return {
                changedMarkets,
                baseFeePerGas: event.nextBaseFeePerGas,
                blockReceivedAt: event.blockReceivedAt,
                blockNumber: event.blockNumber,
                initial: false,
              };
            }),
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
        return this.currentBlockNumber$.pipe(
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
          opportunities: this.runStrategies(
            event.changedMarkets,
            event.blockNumber,
            event.blockReceivedAt,
          ),
          baseFeePerGas: event.baseFeePerGas,
          blockReceivedAt: event.blockReceivedAt,
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
      this.uniswapV3Syncer.syncPoolStates(uniswapV3Markets),
    ]);
  }

  private runStrategies(
    changedMarkets: EthMarket[],
    blockNumber: number,
    blockReceivedAt: number,
  ): ArbitrageOpportunity[] {
    return this.strategies
      .reduce((acc, strategy) => {
        const opportunities = strategy.getArbitrageOpportunities(
          changedMarkets,
          this.markets,
          blockNumber,
        );
        for (const op of opportunities) {
          acc.push({ ...op, blockReceivedAt });
        }
        return acc;
      }, [] as ArbitrageOpportunity[])
      .sort((a, b) => (a.profit < b.profit ? 1 : a.profit > b.profit ? -1 : 0));
  }
}

export function loadChangedEthMarkets(
  provider: providers.JsonRpcProvider,
  providersForRace: providers.JsonRpcProvider[],
  blockNumber: number,
  marketsByAddress: Record<Address, EthMarket>,
): Promise<EthMarket[]> {
  const indicatorTopics = new Set<string>([...UNISWAP_POOL_EVENT_TOPICS, UNISWAP_SYNC_EVENT_TOPIC]);

  return raceGetLogs(provider, providersForRace, {
    fromBlock: blockNumber,
    toBlock: blockNumber,
  }).then((logs) => {
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

export function fromNewBlockEvent(
  provider: providers.WebSocketProvider,
): Observable<NewBlockEvent> {
  let id = 0;

  return new Observable<NewBlockEvent>((observer) => {
    provider._subscribe('newHeads', ['newHeads'], (rawBlock: any) => {
      const blockReceivedAt = Date.now();
      const blockNumber = Number(rawBlock.number);
      const logMessage = `${id++ === 0 ? 'Initial block' : 'New block'}: ${blockNumber}`;

      console.log();
      if (canCalcBaseFeePerGas(blockNumber)) {
        const baseFeePerGas = BigInt(rawBlock.baseFeePerGas);
        const gasUsed = BigInt(rawBlock.gasUsed);
        const gasLimit = BigInt(rawBlock.gasLimit);
        const nextBaseFeePerGas = calcBaseFeePerGas(baseFeePerGas, gasUsed, gasLimit);
        console.log(`${logMessage}, next gas price: ${nextBaseFeePerGas.toString()}`);
        observer.next({ blockReceivedAt, blockNumber, nextBaseFeePerGas });
      } else {
        console.log(logMessage);
        getBaseFeePerGas(provider, blockNumber).then((nextBaseFeePerGas) => {
          console.log(`Next gas price: ${nextBaseFeePerGas}, for block ${blockNumber}`);
          observer.next({ blockReceivedAt, blockNumber, nextBaseFeePerGas });
        });
      }
    });
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

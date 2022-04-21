import { providers } from 'ethers';
import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy, endTime,
  EthMarket,
  fromProviderEvent, printOpportunity, startTime,
  UNISWAP_SYNC_EVENT_TOPIC
} from './entities';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV2Market } from './uniswap/uniswap-v2-market';
import { concatMap, from, map, Observable, startWith, tap } from 'rxjs';



export class ArbitrageRunner {
  readonly marketsByAddress: Record<Address, EthMarket>;

  constructor(
    readonly markets: EthMarket[],
    readonly strategies: ArbitrageStrategy[],
    readonly uniswapV2ReservesSyncer: UniswapV2ReservesSyncer,
    readonly provider: providers.JsonRpcProvider,
  ) {
    this.marketsByAddress = this.markets.reduce((acc, market) => {
      acc[market.marketAddress] = market;
      return acc;
    }, {} as Record<Address, EthMarket>)
  }

  start(): Observable<ArbitrageOpportunity[]> {
    return fromProviderEvent<number>(this.provider, 'block').pipe(
      startWith(null),
      tap((blockNumber) => {
        console.log(`Block received: ${blockNumber ?? 'initial'}`);
      }),
      concatMap((blockNumber: number | null) => from((async () => {
        const changedMarkets = blockNumber ? await loadChangedEthMarkets(this.provider, blockNumber, this.marketsByAddress) : this.markets;
        const uniswapV2Markets = changedMarkets.filter(market => market.protocol === 'uniswapV2') as UniswapV2Market[];
        await this.uniswapV2ReservesSyncer.syncReserves(uniswapV2Markets);
        return changedMarkets;
      })())),
      map((changedMarkets: EthMarket[]) => {
        startTime('render');
        return this.runStrategies(changedMarkets);
      }),
      tap((opportunities) => {
        console.log(`Found opportunities: ${opportunities.length} in ${endTime('render')}ms`)
        opportunities.forEach(printOpportunity);
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
  return provider.getLogs({
    fromBlock: blockNumber,
    toBlock: blockNumber,
  }).then(logs => {
    const uniswapV2SyncLogs = logs.filter(log => log.topics.includes(UNISWAP_SYNC_EVENT_TOPIC));
    const changedAddresses = uniswapV2SyncLogs.map(log => log.address);

    return changedAddresses.reduce((acc, address) => {
      if (marketsByAddress[address]) {
        acc.push(marketsByAddress[address]);
      }
      return acc;
    }, [] as EthMarket[]);
  });
}

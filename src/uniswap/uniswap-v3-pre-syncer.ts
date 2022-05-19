import { UniswapV3PoolStateSyncer } from './uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from './uniswap-v3-market';
import { Address, endTime, NETWORK, startTime } from '../entities';
import { deserializeMarket, serializeMarket } from '../serializer';
import fs from 'fs';

export class UniswapV3PreSyncer {
  private cachePath: string;
  private cache: any | null;
  private cacheTimestamp = Date.now();

  constructor(
    readonly syncer: UniswapV3PoolStateSyncer,
    readonly markets: UniswapV3Market[],
    readonly useCache = false,
  ) {
    this.cachePath = `./cache/pre-syncer-cache/${NETWORK}.json`;

    if (this.useCache) {
      this.loadCache();
      const HOUR = 60 * 60000;

      if (Date.now() - this.cacheTimestamp >= HOUR) {
        this.clearCache();
      }
    }
  }

  async presync(): Promise<void> {
    const leftToSync = this.syncCachedMarkets(this.markets);

    if (leftToSync.length !== this.markets.length) {
      console.log(
        `Pre-Sync v3: ${this.markets.length - leftToSync.length} markets loaded from cache`,
      );
      return;
    }

    startTime('presyncV3');
    console.log(`Pre-Sync v3 markets: ${leftToSync.length} ...`);
    await this.syncer.syncPoolStates(leftToSync, 0);
    console.log(`Pre-Sync v3 markets: ${leftToSync.length} finished in ${endTime('presyncV3')}ms`);
    this.saveCache(this.markets);
  }

  private syncCachedMarkets(marketsV3: UniswapV3Market[]): UniswapV3Market[] {
    const loadedMarkets = (this.cache?.markets ?? []).map((item: any) =>
      deserializeMarket(item),
    ) as UniswapV3Market[];
    const marketsV3ByAddress = marketsV3.reduce((acc, m) => {
      acc[m.marketAddress] = m;
      return acc;
    }, {} as Record<Address, UniswapV3Market>);
    const marketsLeftToSync = new Set<UniswapV3Market>(marketsV3);

    for (const loadedMarket of loadedMarkets) {
      const market = marketsV3ByAddress[loadedMarket.marketAddress];

      if (!market || !loadedMarket?.pool?.ticks?.length) {
        continue;
      }

      market.setPoolState(
        loadedMarket.pool.tickCurrent,
        loadedMarket.pool.sqrtRatioX96,
        loadedMarket.pool.liquidity,
        loadedMarket.pool.ticks,
      );
      marketsLeftToSync.delete(market);
    }

    return Array.from(marketsLeftToSync);
  }

  private saveCache(marketsV3: UniswapV3Market[]): void {
    const serializedMarkets = [];

    for (const market of marketsV3) {
      if (market?.pool?.ticks?.length) {
        serializedMarkets.push(serializeMarket(market));
      }
    }

    fs.mkdirSync('./cache/pre-syncer-cache/', { recursive: true });
    fs.writeFileSync(
      this.cachePath,
      JSON.stringify(
        {
          markets: serializedMarkets,
          timestamp: this.cacheTimestamp,
        },
        null,
        2,
      ),
    );
  }

  private loadCache(): void {
    try {
      this.cache = JSON.parse(fs.readFileSync(this.cachePath).toString());
    } catch (e) {
      this.cache = null;
    }

    this.cacheTimestamp = this.cache?.timestamp ?? Date.now();
  }

  private clearCache(): void {
    try {
      this.cache = null;
      this.cacheTimestamp = Date.now();
      fs.writeFileSync(this.cachePath, '');
      console.log('Pre-Sync v3. Cleared old cache');
    } catch (e) {}
  }
}

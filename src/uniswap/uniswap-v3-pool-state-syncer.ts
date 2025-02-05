import { Address, splitIntoBatches, UNISWAP_V3_GRAPH_ENDPOINT } from '../entities';
import { UniswapV3Market } from './uniswap-v3-market';
const fetch = require('node-fetch');
import gql from 'graphql-tag';
import ApolloClient from 'apollo-boost';
import { defer, from, lastValueFrom, mergeMap, reduce } from 'rxjs';
import { retry } from 'rxjs/operators';
import { NativeTick } from './native-pool/native-pool-utils';

interface PoolData {
  id: string;
  sqrtPrice: string;
  tick: string;
  liquidity: string;
  ticks: {
    tickIdx: string;
    liquidityNet: string;
    liquidityGross: string;
  }[];
}

interface PoolsBatch {
  pools: PoolData[];
  _meta: {
    block: {
      number: number;
    };
  };
}

interface RequestedPools {
  oversizePools: PoolData[];
  pools: PoolData[];
}

export class UniswapV3PoolStateSyncer {
  private oversizePoolAddresses = new Set<Address>([]);
  private client: ApolloClient<any>;
  private bulkQuery: any;
  private query: any;

  constructor(readonly parallelCount: number, endpoint?: string) {
    this.client = new ApolloClient({
      uri: endpoint ?? UNISWAP_V3_GRAPH_ENDPOINT,
      fetch,
    });

    this.query = gql`
      query PoolsBatch($pools: [String]!, $offset: Int!) {
        _meta {
          block {
            number
          }
        }
        pools(where: { id_in: $pools }) {
          id
          sqrtPrice
          tick
          liquidity
          ticks(first: 1000, skip: $offset, orderBy: tickIdx) {
            tickIdx
            liquidityNet
            liquidityGross
          }
        }
      }
    `;

    this.bulkQuery = gql`
      query PoolsBulk($poolsOffset: Int!) {
        _meta {
          block {
            number
          }
        }
        pools(first: 1000, orderBy: id, skip: $poolsOffset) {
          id
          sqrtPrice
          tick
          liquidity
          ticks(first: 1000, orderBy: tickIdx) {
            tickIdx
            liquidityNet
            liquidityGross
          }
        }
      }
    `;
  }

  async getBlockNumber(requiredBlockNumber: number): Promise<number> {
    const r = await this.client.query({
      query: gql`
        query TicksPool {
          _meta {
            block {
              number
            }
            deployment
          }
        }
      `,
      fetchPolicy: 'no-cache',
    });

    if (r?.data?._meta?.block?.number < requiredBlockNumber) {
      await this.getBlockNumber(requiredBlockNumber);
    }

    return r?.data?._meta?.block?.number ?? 0;
  }

  async syncPoolStates(markets: UniswapV3Market[], minBlockNumber = 0): Promise<void> {
    if (markets.length === 0) {
      console.log(`Sync V3 skipped`);
      return;
    }

    if (markets.length > 1000) {
      await this.syncMarketsBulk(markets, minBlockNumber);
    } else {
      await this.syncMarkets(markets, minBlockNumber);
    }
  }

  private async syncMarketsBulk(markets: UniswapV3Market[], minBlockNumber: number): Promise<void> {
    const bulkRecursive = async (poolsOffset = 0): Promise<PoolData[]> => {
      const bulk = await lastValueFrom(
        defer(() => this.requestPoolsBulk(poolsOffset, minBlockNumber)).pipe(retry(5)),
      );

      if (poolsOffset < 5) {
        return [...bulk.pools, ...(await bulkRecursive(poolsOffset + 1))];
      }

      return bulk.pools;
    };

    const marketsByAddress = this.marketsByAddress(markets);
    const marketAddressesToSync = new Set<Address>(Object.keys(marketsByAddress));
    const pools = await bulkRecursive();

    for (const pool of pools) {
      if (pool.ticks.length >= 1000) {
        continue;
      }

      if (!marketsByAddress[pool.id]) {
        // console.log(pool);
        // console.log(markets.length);
        // console.log(marketAddressesToSync);
        continue;
      }
      this.setPoolState(marketsByAddress[pool.id], pool);
      marketAddressesToSync.delete(pool.id);
    }

    const marketsToSync = Array.from(marketAddressesToSync).map(
      (address) => marketsByAddress[address],
    );
    console.log(`Request v3 markets left to sync:`, marketsToSync.length);

    await this.syncMarkets(marketsToSync, minBlockNumber);
  }

  private async syncMarkets(markets: UniswapV3Market[], minBlockNumber: number): Promise<void> {
    const marketsByAddress = this.marketsByAddress(markets);
    const addresses = Object.keys(marketsByAddress);

    const oversizeAddresses = addresses.filter((address) =>
      this.oversizePoolAddresses.has(address),
    );

    const [{ pools, oversizePools }, oversizeData] = await Promise.all([
      this.getPools(addresses, minBlockNumber, 0),
      this.getPoolsRecursive(oversizeAddresses, minBlockNumber, 1),
    ]);

    const newOversizeAddresses = [];
    for (const oversizePool of oversizePools) {
      if (!this.oversizePoolAddresses.has(oversizePool.id)) {
        newOversizeAddresses.push(oversizePool.id);
        this.oversizePoolAddresses.add(oversizePool.id);
      }
    }

    if (newOversizeAddresses.length) {
      oversizeData.push(...(await this.getPoolsRecursive(newOversizeAddresses, minBlockNumber, 1)));
    }

    pools.push(...this.mergePoolsExtraData(oversizePools, oversizeData));

    for (const pool of pools) {
      if (!marketsByAddress[pool.id]) {
        console.log(pool);
        console.log(marketsByAddress);
      }
      this.setPoolState(marketsByAddress[pool.id], pool);
    }
  }

  private async getPoolsRecursive(
    addresses: Address[],
    minBlockNumber: number,
    offset = 0,
  ): Promise<PoolData[]> {
    const data = await this.getPools(addresses, minBlockNumber, offset);

    if (!data.oversizePools.length) {
      return data.pools;
    }

    const oversizeAddresses = data.oversizePools.map((p) => p.id);
    const oversizePoolsExtraData = await this.getPoolsRecursive(
      oversizeAddresses,
      minBlockNumber,
      offset + 1,
    );

    return [...data.pools, ...this.mergePoolsExtraData(data.oversizePools, oversizePoolsExtraData)];
  }

  private async getPools(
    addresses: Address[],
    minBlockNumber: number,
    offset = 0,
  ): Promise<RequestedPools> {
    if (!addresses.length) {
      return { pools: [], oversizePools: [] };
    }

    const batchPools = await this.requestPools(addresses, minBlockNumber, offset);

    const oversizePools: PoolData[] = [];
    const pools: PoolData[] = [];

    for (const pool of batchPools) {
      if (pool.ticks.length >= 1000) {
        oversizePools.push(pool);
      } else {
        pools.push(pool);
      }
    }

    return { pools, oversizePools };
  }

  private async requestPools(
    addresses: Address[],
    minBlockNumber: number,
    offset = 0,
  ): Promise<PoolData[]> {
    const request$ = from(splitIntoBatches<Address>(addresses, 100)).pipe(
      mergeMap((addressBatch) => {
        return defer(() => this.requestPoolsBatch(addressBatch, minBlockNumber, offset)).pipe(
          retry(5),
        );
      }, this.parallelCount),
      reduce((acc, batch) => {
        acc.push(...batch.pools);
        return acc;
      }, [] as PoolData[]),
    );

    return lastValueFrom(request$);
  }

  private async requestPoolsBatch(
    pools: Address[],
    minBlockNumber: number = 0,
    offset = 0,
  ): Promise<PoolsBatch> {
    const { data, errors } = await this.client.query<PoolsBatch>({
      query: this.query,
      variables: {
        pools: pools,
        offset: offset * 1000,
      },
      fetchPolicy: 'no-cache',
    });

    if (errors) {
      console.log('Request v3 errors, retry:', errors);
      throw errors;
    }

    console.log(
      'Request v3:',
      pools.length,
      offset,
      data.pools.reduce((acc, pool) => acc + pool.ticks.length, 0),
    );

    if (data._meta.block.number < minBlockNumber) {
      return await this.requestPoolsBatch(pools, minBlockNumber, offset);
    }

    return data;
  }

  private async requestPoolsBulk(
    poolsOffset: number,
    minBlockNumber: number = 0,
  ): Promise<PoolsBatch> {
    const { data, errors } = await this.client.query<PoolsBatch>({
      query: this.bulkQuery,
      variables: {
        poolsOffset: poolsOffset * 1000,
      },
      fetchPolicy: 'no-cache',
    });

    if (errors) {
      console.log('Request v3 errors, retry:', errors);
      throw errors;
    }

    console.log(
      'Request v3 bulk:',
      data.pools.length,
      poolsOffset,
      data.pools.reduce((acc, pool) => acc + pool.ticks.length, 0),
    );

    if (data._meta.block.number < minBlockNumber) {
      return await this.requestPoolsBulk(poolsOffset, minBlockNumber);
    }

    return data;
  }

  private mergePoolsExtraData(oversizePools: PoolData[], extraDataPools: PoolData[]): PoolData[] {
    const oversizePoolsMap = oversizePools.reduce((acc, m) => {
      acc[m.id] = m;
      return acc;
    }, {} as Record<Address, PoolData>);

    for (const extraData of extraDataPools) {
      const oldPool = oversizePoolsMap[extraData.id];

      if (!oldPool) {
        continue;
      }

      oversizePoolsMap[extraData.id] = {
        ...oldPool,
        ticks: [...oldPool.ticks, ...extraData.ticks],
      };
    }

    return Object.values(oversizePoolsMap);
  }

  private marketsByAddress(markets: UniswapV3Market[]): Record<Address, UniswapV3Market> {
    return markets.reduce((acc, market) => {
      acc[market.marketAddress.toLowerCase()] = market;
      return acc;
    }, {} as Record<Address, UniswapV3Market>);
  }

  private setPoolState(market: UniswapV3Market, pool: PoolData): void {
    market.setPoolState(
      Number(pool.tick),
      BigInt(pool.sqrtPrice),
      BigInt(pool.liquidity),
      pool.ticks
        .map(
          (tick) =>
            new NativeTick(
              Number(tick.tickIdx),
              BigInt(tick.liquidityGross),
              BigInt(tick.liquidityNet),
            ),
        )
        .filter((tick) => tick.liquidityNet !== 0n || tick.liquidityGross !== 0n),
    );
  }
}

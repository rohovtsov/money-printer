import { BigNumber, Contract, providers } from 'ethers';
import {
  Address,
  PoolState,
  endTime, splitIntoBatches,
  startTime, UNISWAP_POOL_ABI, UNISWAP_V3_QUOTER_ABI, UNISWAP_V3_QUOTER_ADDRESS,
} from '../entities';
import { UniswapV3Market } from './uniswap-v3-market';
const fetch = require("node-fetch");
import gql from "graphql-tag";
import ApolloClient from 'apollo-boost';
import { Tick } from '@uniswap/v3-sdk';
import { JSBI } from '@uniswap/sdk';
import { from, lastValueFrom, map, mergeMap, reduce } from 'rxjs';



interface PoolData {
  id: string;
  sqrtPrice: string;
  tick: string;
  liquidity: string;
  ticks: {
    tickIdx: string;
    liquidityGross: string;
    liquidityNet: string;
  }[];
}

interface PoolsBatch {
  pools: PoolData[];
  _meta: {
    block: {
      number: number;
    }
  }
}

interface RequestedPools {
  oversizePools: PoolData[],
  pools: PoolData[]
}

export class UniswapV3PoolStateSyncer {
  private oversizePoolAddresses = new Set<Address>([]);
  private client: ApolloClient<any>;
  private quoterContract: any;
  private query: any;

  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly parallelCount: number,
  ) {
    this.quoterContract = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
    this.client = new ApolloClient({
      uri: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
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
          ticks (first: 1000, skip: $offset, orderBy: tickIdx) {
            tickIdx
            liquidityGross 
            liquidityNet
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
      fetchPolicy: 'no-cache'
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

    startTime('syncV3');

    await this.syncMarkets(markets, minBlockNumber);

    console.log(`Sync V3 complete: ${markets.length} markets in ${endTime('syncV3')}ms`);
  }

  private async syncMarkets(markets: UniswapV3Market[], minBlockNumber: number): Promise<void> {
    const marketsByAddress = markets.reduce((acc, market) => {
      acc[market.marketAddress.toLowerCase()] = market;
      return acc;
    }, {} as Record<Address, UniswapV3Market>);
    const addresses = Object.keys(marketsByAddress);

    const oversizeAddresses = addresses.filter(address => this.oversizePoolAddresses.has(address));

    const [ { pools, oversizePools }, oversizeData ] = await Promise.all([
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
      marketsByAddress[pool.id].setPoolState(
        Number(pool.tick),
        BigNumber.from(pool.sqrtPrice),
        BigNumber.from(pool.liquidity),
        pool.ticks.map(tick => new Tick({
          index: Number(tick.tickIdx),
          liquidityGross: JSBI.BigInt(tick.liquidityGross.toString()),
          liquidityNet: JSBI.BigInt(tick.liquidityNet.toString())
        }))
      );
    }
  }

  private async getPoolsRecursive(addresses: Address[], minBlockNumber: number, offset = 0): Promise<PoolData[]> {
    const data = await this.getPools(addresses, minBlockNumber, offset);

    if (!data.oversizePools.length) {
      return data.pools;
    }

    const oversizeAddresses = data.oversizePools.map(p => p.id);
    const oversizePoolsExtraData = await this.getPoolsRecursive(oversizeAddresses, minBlockNumber, offset + 1);

    return [...data.pools, ...this.mergePoolsExtraData(data.oversizePools, oversizePoolsExtraData)];
  }

  private async getPools(addresses: Address[], minBlockNumber: number, offset = 0): Promise<RequestedPools> {
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

  private async requestPools(addresses: Address[], minBlockNumber: number, offset = 0): Promise<PoolData[]> {
    const request$ = from(
      splitIntoBatches<Address>(addresses, 100)
    ).pipe(
      mergeMap((addressBatch) => {
        return from(this.requestPoolsBatch(addressBatch, minBlockNumber, offset));
      }, this.parallelCount),
      reduce((acc, batch) => {
        acc.push(...batch.pools);
        return acc;
      }, [] as PoolData[]),
    )

    return lastValueFrom(request$);
  }

  private async requestPoolsBatch(pools: Address[], minBlockNumber: number = 0, offset = 0): Promise<PoolsBatch> {
    const { data } : { data: PoolsBatch } = await this.client.query({
      query: this.query,
      variables: {
        pools: pools,
        offset: offset * 1000,
      },
      fetchPolicy: 'no-cache'
    });

    console.log('Request v3:', pools.length, offset, data.pools.reduce((acc, pool) => acc + pool.ticks.length, 0));

    if (data._meta.block.number < minBlockNumber) {
      return await this.requestPoolsBatch(pools, minBlockNumber, offset);
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
        ticks: [...oldPool.ticks, ...extraData.ticks]
      }
    }

    return Object.values(oversizePoolsMap);
  }
}

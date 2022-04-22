import { BigNumber, Contract, providers } from 'ethers';
import {
  Address,
  endTime, ETHER, GWEI,
  startTime, UNISWAP_V3_QUOTER_ABI, UNISWAP_V3_QUOTER_ADDRESS,
} from '../entities';
import { UniswapV3Market } from './uniswap-v3-market';
const fetch = require("node-fetch");
import gql from "graphql-tag";
import ApolloClient from 'apollo-boost';
import { concat, EMPTY, from, lastValueFrom, mergeMap, of, tap, zip } from 'rxjs';
import { catchError } from 'rxjs/operators';
const { toChecksumAddress } = require('ethereum-checksum-address');



interface GraphPool {
  id: Address;
  tick: string;
  sqrtPrice: string;
  token0Price: string;
  token1Price: string;
  createdAtBlockNumber: string;
}


export class UniswapV3PoolStateSyncer {
  private client: ApolloClient<any>;
  private quoterContract: any;
  private query: any;

  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly batchSize: number,
  ) {
    this.quoterContract = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
    this.client = new ApolloClient({
      uri: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
      fetch,
    });

    this.query = gql`
      query PoolsState($lastBlock: BigInt, $random: BigInt) {
        pools(first: ${this.batchSize}, orderBy: createdAtBlockNumber, where: { createdAtBlockNumber_gte: $lastBlock }) { 
          id 
          tick 
          sqrtPrice
          token0Price
          token1Price
          createdAtBlockNumber
        },
        ticks(first: 1, where: { createdAtBlockNumber_gte: $random }) {
          id
        }
      }
    `;
  }

 /* async syncPoolStates(markets: UniswapV3Market[]): Promise<void> {
    if (markets.length === 0) {
      console.log(`Sync V3 skipped`);
      return;
    }

    let id = 0;
    startTime('syncV3');

    await lastValueFrom(from(markets).pipe(
      mergeMap((market, i) => {
        return zip([
          from(this.quoterContract.callStatic.quoteExactInputSingle(market.tokens[0], market.tokens[1], market.fee, GWEI.toString(), 0)),
          from(this.quoterContract.callStatic.quoteExactInputSingle(market.tokens[1], market.tokens[0], market.fee, GWEI.toString(), 0)),
        ]).pipe(
          catchError((err) => {
            return of([null, null] as [any, any]);
          }),
          tap(([sellOut, buyOut]: [any, any]) => {
            console.log(`${++id} / ${markets.length}`, sellOut?.toString(), buyOut?.toString());
            market.setPrices(sellOut, buyOut);
          }),
        );
      }, 25)
    ));

    console.log(`Sync V3 complete: ${markets.length} markets in ${endTime('syncV3')}ms`);
  }*/

  async syncPoolStates(markets: UniswapV3Market[]): Promise<void> {
    if (markets.length === 0) {
      console.log(`Sync V3 skipped`);
      return Promise.resolve();
    }

    startTime('syncV3');

    const group = markets.reduce((acc, item) => {
      acc[item.marketAddress] = item;
      return acc;
    }, {} as Record<Address, UniswapV3Market>);

    const pools = await this.syncPoolStatesBatch(0);
    for (const pool of pools) {
      const market = group?.[toChecksumAddress(pool.id)];
      market?.setState(
        Number(pool.tick),
        BigNumber.from(pool.sqrtPrice),
        pool.token0Price,
        pool.token1Price,
      );
    }

    console.log(`Sync V3 complete: ${pools.length} markets in ${endTime('syncV3')}ms`);

    return Promise.resolve();
  }

  splitMarketsIntoBatches(markets: UniswapV3Market[]): UniswapV3Market[][] {
    const batchSize = this.batchSize;
    const batchCount = Math.ceil(markets.length / batchSize);

    return Array.from({ length: batchCount })
      .map((_, i) => markets.slice(i * batchSize, Math.min(((i + 1) * batchSize), markets.length)));
  }

  async syncPoolStatesBatch(lastBlock: number, pools: GraphPool[] = []): Promise<GraphPool[]> {
    const result = await this.client.query({ query: this.query, variables: {
      lastBlock,
      random: Math.round(Math.random() * 10000000),
    } });

    const loadedPools: GraphPool[] = [...(result?.data?.pools ?? [])];
    const totalPools = [...pools, ...loadedPools];

    if (loadedPools.length < this.batchSize) {
      return totalPools;
    }

    const nextBlock = Number(loadedPools?.[loadedPools.length - 1]?.createdAtBlockNumber) + 1;
    return this.syncPoolStatesBatch(nextBlock, totalPools);
  }
}

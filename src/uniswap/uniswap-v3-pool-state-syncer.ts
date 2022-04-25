import { BigNumber, Contract, providers } from 'ethers';
import {
  Address,
  endTime,
  startTime, UNISWAP_POOL_ABI, UNISWAP_V3_QUOTER_ABI, UNISWAP_V3_QUOTER_ADDRESS,
} from '../entities';
import { UniswapV3Market } from './uniswap-v3-market';
const fetch = require("node-fetch");
import gql from "graphql-tag";
import ApolloClient from 'apollo-boost';
import { Tick } from '@uniswap/v3-sdk';
import { JSBI } from '@uniswap/sdk';
import { defer, from, lastValueFrom, mergeMap, tap } from 'rxjs';
import { retry } from 'rxjs/operators';



interface PoolState {
  ticks: Tick[];
  tick: number;
  sqrtPriceX96: BigNumber;
  liquidity: BigNumber;
}


export class UniswapV3PoolStateSyncer {
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
      query TicksPool($poolAddress: BigInt, $offset: Int, $random: BigInt) {
        ticks(first: 1000, skip: $offset, orderBy: tickIdx, where: { 
          poolAddress: $poolAddress
        }) {
          tickIdx
          liquidityGross 
          liquidityNet
        },
        pools(first: 1, where: { createdAtBlockNumber: $random }) { id }
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
      return;
    }

    startTime('syncV3');

    //150 ... 50
    let id = 0;
    const request$ = from(markets).pipe(
      mergeMap(market => {
        return defer(() => from(this.requestPoolState(market.marketAddress))).pipe(
          retry(5),
          tap(state => {
            console.log(`Loaded ${++id}/${markets.length}, ${state.ticks.length}`);
            market.setPoolState(state.tick, state.sqrtPriceX96, state.liquidity, state.ticks);
          })
        );
      }, this.parallelCount),
    )

    await lastValueFrom(request$);
    console.log(`Sync V3 complete: ${markets.length} markets in ${endTime('syncV3')}ms`);
  }

  async requestPoolState(poolAddress: Address): Promise<PoolState> {
    const poolContract = new Contract(poolAddress, UNISWAP_POOL_ABI, this.provider);

    const [slot0, liquidityData, ticks] = await Promise.all([
      poolContract.functions.slot0(),
      poolContract.functions.liquidity(),
      this.requestPoolTicks(poolAddress),
    ])

    return {
      tick: slot0.tick,
      sqrtPriceX96: slot0.sqrtPriceX96,
      liquidity: liquidityData[0],
      ticks,
    };
  }

  private async requestPoolTicks(poolAddress: Address, offset = 0): Promise<Tick[]> {
    const result = await this.client.query({ query: this.query, variables: {
      random: Math.round(Math.random() * 10000000),
      poolAddress: poolAddress.toLowerCase(),
      offset: offset,
    } });

    const ticksCount = result.data.ticks.length;
    const output = result.data.ticks.map((data: any) => new Tick({
      index: Number(data.tickIdx),
      liquidityGross: JSBI.BigInt(data.liquidityGross),
      liquidityNet: JSBI.BigInt(data.liquidityNet)
    }));

    if (ticksCount >= 1000) {
      return [...output, ...(await this.requestPoolTicks(poolAddress, offset + ticksCount))]
    }

    return output;
  }
}

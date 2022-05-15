import { BigNumber, Contract, providers } from 'ethers';
import {
  Address,
  endTime,
  MONEY_PRINTER_QUERY_ABI,
  MONEY_PRINTER_QUERY_ADDRESS,
  startTime,
} from '../entities';
import { UniswapV3Market } from './uniswap-v3-market';
import { Tick } from '@uniswap/v3-sdk';
import { JSBI } from '@uniswap/sdk';
import { defer, lastValueFrom, merge, tap } from 'rxjs';
import { retry } from 'rxjs/operators';

interface PoolState {
  tick: number;
  address: Address;
  liquidity: BigNumber;
  sqrtPriceX96: BigNumber;
  ticks: Tick[];
}

interface PoolBatchPayload {
  bufferSizes: number[];
  addresses: Address[];
  totalBufferSize: number;
}

export class UniswapV3PoolStateSyncerContractQuery {
  private queryContract: Contract;

  constructor(readonly provider: providers.JsonRpcProvider, readonly parallelCount: number) {
    this.queryContract = new Contract(
      MONEY_PRINTER_QUERY_ADDRESS,
      MONEY_PRINTER_QUERY_ABI,
      provider,
    );
  }

  async syncPoolStates(markets: UniswapV3Market[]): Promise<void> {
    const marketsByTickCount = markets.reduce((acc, market) => {
      const key = String(market?.pool?.advancedTicks?.length ?? 0);
      (acc[key] ?? (acc[key] = [])).push(market);
      return acc;
    }, {} as Record<string, UniswapV3Market[]>);
    const marketsByAddress = markets.reduce((acc, market) => {
      acc[market.marketAddress] = market;
      return acc;
    }, {} as Record<string, UniswapV3Market>);

    const marketsToSkip = marketsByTickCount['0']?.length ?? 0;

    if (marketsToSkip) {
      console.log(`Request v3 skipping zero tick markets:`, marketsToSkip);
    }

    const batches: PoolBatchPayload[] = [];
    let nextBatch: PoolBatchPayload = { bufferSizes: [], addresses: [], totalBufferSize: 0 };
    const maxMarketsInBatch = 300;
    const maxTicksInBatch = 1500;
    const extraTicksForBuffer = 6;

    for (const key in marketsByTickCount) {
      const ticksCount = Number(key);

      if (ticksCount <= 0) {
        continue;
      }

      for (const market of marketsByTickCount[key]) {
        if (
          nextBatch.addresses.length >= maxMarketsInBatch ||
          nextBatch.totalBufferSize >= maxTicksInBatch
        ) {
          batches.push(nextBatch);
          nextBatch = { bufferSizes: [], addresses: [], totalBufferSize: 0 };
        }

        const estimatedTicksCount = ticksCount + extraTicksForBuffer;
        nextBatch.addresses.push(market.marketAddress);
        nextBatch.bufferSizes.push(estimatedTicksCount);
        nextBatch.totalBufferSize += estimatedTicksCount;
      }
    }

    batches.push(nextBatch);
    console.log(`Request v3 batches:`, batches.length);

    await lastValueFrom(
      merge(
        ...batches.map((batch) => defer(() => this.requestStatesBatch(batch)).pipe(retry(5))),
        this.parallelCount,
      ).pipe(
        tap((states) => {
          for (const state of states) {
            marketsByAddress[state.address].setPoolState(
              state.tick,
              state.sqrtPriceX96,
              state.liquidity,
              state.ticks,
            );
          }
        }),
      ),
    );
  }

  async requestStatesBatch(payload: PoolBatchPayload): Promise<PoolState[]> {
    console.log(`Request v3 contract:`, payload.addresses.length, payload.totalBufferSize);
    const outputContract = (
      await this.queryContract.functions.getStatesForPools(payload.addresses, payload.bufferSizes)
    )[0] as any[];
    console.log(`Request v3 contract done:`, payload.addresses.length, payload.totalBufferSize);

    return outputContract.map((state, index) => {
      const ticks = [];

      for (let i = 0; i < state.ticks.length; i += 2) {
        ticks.push(
          new Tick({
            index: state.ticks[i].toNumber(),
            liquidityGross: JSBI.BigInt(0),
            liquidityNet: JSBI.BigInt(state.ticks[i + 1].toString()),
          }),
        );
      }

      return {
        address: payload.addresses[index],
        sqrtPriceX96: state.sqrtPriceX96,
        liquidity: state.liquidity,
        tick: state.tick,
        ticks: ticks,
      };
    });
  }
}

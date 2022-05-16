import { Contract, providers } from 'ethers';
import {
  Address,
  endTime,
  MONEY_PRINTER_QUERY_ABI,
  MONEY_PRINTER_QUERY_ADDRESS,
  startTime,
} from '../entities';
import { UniswapV3Market } from './uniswap-v3-market';
import { defer, lastValueFrom, merge, tap } from 'rxjs';
import { retry } from 'rxjs/operators';
import { NativeTick } from './native-pool/native-pool-utils';

interface PoolState {
  tick: number;
  address: Address;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  ticks: NativeTick[];
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
    if (!markets.length) {
      console.log(`Sync V3 skipped`);
      return;
    }

    startTime('syncV3');
    const marketsByTickCount = markets.reduce((acc, market) => {
      const key = String(market?.pool?.ticks?.length ?? 0);
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
    //TODO: потюнить
    const maxMarketsInBatch = 100;
    const maxTicksInBatch = 1500;

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

        const extraTicksForBuffer =
          ticksCount < 50
            ? 0
            : ticksCount < 100
            ? 2
            : ticksCount < 200
            ? 4
            : ticksCount < 500
            ? 6
            : 8;
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

    console.log(`Sync V3 complete: ${markets.length} markets in ${endTime('syncV3')}ms`);
  }

  async requestStatesBatch(payload: PoolBatchPayload): Promise<PoolState[]> {
    console.log(`Request v3 contract:`, payload.addresses.length, payload.totalBufferSize);
    const outputContract = await this.queryContract.functions.getStatesForPools(
      payload.addresses,
      payload.bufferSizes,
    );
    //const blockNumber = Number(outputContract[0]);
    const states = outputContract[1] as any[];

    let totalTicks = 0;
    const result = states.map((state, index) => {
      const ticks = [];

      for (let i = 0; i < state.ticks.length; i += 2) {
        const index = state.ticks[i].toNumber();
        const liquidityNet = state.ticks[i + 1].toString();

        if (index === 0 && liquidityNet === '0') {
          break;
        }

        ticks.push(new NativeTick(index, BigInt(0), BigInt(liquidityNet)));
      }

      totalTicks += ticks.length;

      return {
        address: payload.addresses[index],
        sqrtPriceX96: state.sqrtPriceX96.toBigInt(),
        liquidity: state.liquidity.toBigInt(),
        tick: state.tick,
        ticks: ticks,
      };
    });

    console.log(
      `Request v3 contract done:`,
      payload.addresses.length,
      payload.totalBufferSize,
      totalTicks,
    );

    return result;
  }
}

/*
[2022-05-15T17:22:08.862Z] Request v3 contract done: 2 1756 1086
[2022-05-15T17:22:09.003Z] Request v3 contract done: 12 2511 918
[2022-05-15T17:22:09.052Z] Request v3 contract done: 180 360 296
[2022-05-15T17:22:09.113Z] Request v3 contract done: 180 360 244
[2022-05-15T17:22:09.263Z] Request v3 contract done: 148 2065 1181
[2022-05-15T17:22:09.309Z] Request v3 contract done: 180 360 310
[2022-05-15T17:22:09.372Z] Request v3 contract done: 180 360 240
[2022-05-15T17:22:09.445Z] Request v3 contract done: 180 635 447
[2022-05-15T17:22:09.533Z] Request v3 contract done: 180 360 244
*/

import { BigNumber, Contract, providers } from 'ethers';
import { UniswapV2Market } from './uniswap-v2-market';
import {
  endTime,
  splitIntoBatches,
  startTime,
  UNISWAP_LOOKUP_CONTRACT_ADDRESS,
  UNISWAP_QUERY_ABI,
} from '../entities';
import { defer, from, last, lastValueFrom, mergeMap, tap } from 'rxjs';
import { retry } from 'rxjs/operators';

export class UniswapV2ReservesSyncer {
  private queryContract: Contract;

  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly parallelCount: number,
    readonly batchSize: number,
  ) {
    this.queryContract = new Contract(
      UNISWAP_LOOKUP_CONTRACT_ADDRESS,
      UNISWAP_QUERY_ABI,
      this.provider,
    );
  }

  async syncReserves(markets: UniswapV2Market[]): Promise<void> {
    if (markets.length === 0) {
      console.log(`Sync V2 skipped`);
      return Promise.resolve();
    }

    startTime('syncV2');

    const request$ = from(this.splitMarketsIntoBatches(markets)).pipe(
      mergeMap((marketsBatch) => {
        return defer(() => this.syncReservesBatch(marketsBatch)).pipe(retry(5));
      }, this.parallelCount),
      last(),
      tap(() => {
        console.log(`Sync V2 complete: ${markets.length} markets in ${endTime('syncV2')}ms`);
      }),
    );

    return lastValueFrom(request$);
  }

  splitMarketsIntoBatches(markets: UniswapV2Market[]): UniswapV2Market[][] {
    return splitIntoBatches<UniswapV2Market>(markets, this.batchSize);
  }

  async syncReservesBatch(markets: UniswapV2Market[]): Promise<void> {
    const pairAddresses = markets.map((marketPair) => marketPair.marketAddress);

    const reserves: Array<Array<BigNumber>> = (
      await this.queryContract.functions.getReservesByPairs(pairAddresses)
    )[0];
    console.log('Request v2:', markets.length);

    for (let i = 0; i < markets.length; i++) {
      const marketPair = markets[i];
      const reserve = reserves[i];
      marketPair.setTokenReserves(reserve[0].toBigInt(), reserve[1].toBigInt());
    }
  }
}

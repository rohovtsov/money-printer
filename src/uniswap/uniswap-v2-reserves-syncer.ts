import { BigNumber, Contract, providers } from 'ethers';
import { UniswapV2Market } from './uniswap-v2-market';
import { endTime, startTime, UNISWAP_LOOKUP_CONTRACT_ADDRESS, UNISWAP_QUERY_ABI } from '../entities';
import { EMPTY, from, last, lastValueFrom, mergeMap, tap } from 'rxjs';



export class UniswapV2ReservesSyncer {
  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly parallelCount: number,
    readonly batchSize: number,
  ) { }

  async syncReserves(markets: UniswapV2Market[]): Promise<void> {
    if (markets.length === 0) {
      console.log(`Sync V2 skipped`);
      return Promise.resolve();
    }

    startTime('syncV2');

    const request$ = from(this.splitMarketsIntoBatches(markets)).pipe(
      mergeMap(marketsBatch => {
        return this.syncReservesBatch(marketsBatch);
      }, this.parallelCount),
      last(),
      tap(() => {
        console.log(`Sync V2 complete: ${markets.length} markets in ${endTime('syncV2')}ms`);
      })
    );

    return lastValueFrom(request$);
  }

  splitMarketsIntoBatches(markets: UniswapV2Market[]): UniswapV2Market[][] {
    const batchSize = this.batchSize;
    const batchCount = Math.ceil(markets.length / batchSize);

    return Array.from({ length: batchCount })
      .map((_, i) => markets.slice(i * batchSize, Math.min(((i + 1) * batchSize), markets.length)));
  }

  async syncReservesBatch(markets: UniswapV2Market[]): Promise<void> {
    const uniswapQuery = new Contract(UNISWAP_LOOKUP_CONTRACT_ADDRESS, UNISWAP_QUERY_ABI, this.provider);
    const pairAddresses = markets.map(marketPair => marketPair.marketAddress);

    const reserves: Array<Array<BigNumber>> = (await uniswapQuery.functions.getReservesByPairs(pairAddresses))[0];

    for (let i = 0; i < markets.length; i++) {
      const marketPair = markets[i];
      const reserve = reserves[i]
      marketPair.setTokenReserves(reserve[0], reserve[1]);
    }
  }
}

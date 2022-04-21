import { UniswapV2ReservesSyncer } from '../src/uniswap/uniswap-v2-reserves-syncer';
import { providers } from 'ethers';
import { UniswapV2Market } from '../src/uniswap/uniswap-v2-market';
import { expect } from 'chai';

describe('UniswapV2ReservesSyncer', function () {
  let syncer: UniswapV2ReservesSyncer;

  it('Ensure batches are split correctly', function () {
    const batchSize = 37;
    const marketsCount = 218;

    syncer = new UniswapV2ReservesSyncer({} as providers.JsonRpcProvider, 3, batchSize);
    let mockedMarkets: UniswapV2Market[] = Array.from({ length: marketsCount }).map((_, i) => i) as any as UniswapV2Market[];

    const batches = syncer.splitMarketsIntoBatches(mockedMarkets);
    const uniqueMarkets = new Set<UniswapV2Market>([]);
    let totalMarkets = 0;

    for (const batch of batches) {
      expect(batch.length).to.lessThanOrEqual(batchSize);
      totalMarkets += batch.length;

      for (const market of batch) {
        if (!uniqueMarkets.has(market)) {
          uniqueMarkets.add(market);
        } else {
          throw new Error('Market duplicated');
        }
      }
    }

    expect(totalMarkets).to.equal(marketsCount);
  });
});

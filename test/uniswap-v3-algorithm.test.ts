import { expect } from 'chai';
import { loadNangle } from '../src/serializer';
import { FixedAmountArbitrageStrategy } from '../src/strategies/fixed-amount-arbitrage-strategy';
import { printOpportunity, WETH_ADDRESS } from '../src/entities';
import { ETHER } from '../src/entities';

describe('UniswapV3AlgorithmTest', function () {
  this.timeout(10000);
  let nangle = loadNangle('./test/res/nangle.json');
  let oldStrategy = new FixedAmountArbitrageStrategy(
    {
      [WETH_ADDRESS]: new Array(100000).fill(null).map((el, i) => (ETHER / 10n) * BigInt(i)),
    },
    nangle.markets,
  );
  let oldOpportunity = oldStrategy.calculateOpportunity(nangle as any, 0)!;
  const newOpportunity = { profit: 0n, operations: [] }; // todo вставить сюда свою стратегию

  it('UniswapV3AlgorithmTest', function () {
    console.log(nangle);
    printOpportunity(oldOpportunity);
    printOpportunity(newOpportunity as any);
    expect(Number(newOpportunity.profit - oldOpportunity.profit)).gt(0);
  });
});

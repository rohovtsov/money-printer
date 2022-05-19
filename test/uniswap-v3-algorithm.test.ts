import { loadNangle } from '../src/serializer';
import { TriangleArbitrageStrategy } from '../src/triangle/triangle-arbitrage-strategy';
import { printOpportunity, WETH_ADDRESS } from '../src/entities';
import { ETHER } from '../src/entities';

describe('UniswapV3AlgorithmTest', function () {
  this.timeout(10000);
  let nangle = loadNangle('./test/res/nangle.json');
  let oldStrategy = new TriangleArbitrageStrategy(
    {
      [WETH_ADDRESS]: [ETHER * 5n],
    },
    nangle.markets,
  );
  let oldOpportunity = oldStrategy.calculateOpportunity(nangle as any, 0)!;

  it('UniswapV3AlgorithmTest', function () {
    console.log(nangle);
    printOpportunity(oldOpportunity);
  });
});

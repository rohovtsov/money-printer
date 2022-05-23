import {
  createNangles,
  createNanglesUsingGraph,
  createQuadangles,
  createTriangles,
  Nangle,
} from '../src/strategies/nangle';
import { Address, endTime, EthMarket, groupEthMarkets, startTime } from '../src/entities';
import { createDummyMarkets, DummyMarket } from './entities/dummy-market';
import { expect } from 'chai';
import fs from 'fs';

describe('NangleTest', function () {
  let realMarkets = JSON.parse(fs.readFileSync('./test/res/dummy-markets.json').toString()).map(
    (item: any) => {
      return new DummyMarket(item[0], [item[1], item[2]], item[3]);
    },
  );
  let markets: EthMarket[];
  let fewMarkets: EthMarket[];
  this.timeout(100000000);

  beforeEach(() => {
    markets = createDummyMarkets([
      ...Array.from({ length: 40000 }).map((_, i) => ['A', `B${i}`]),
      ...Array.from({ length: 800 }).map((_, i) => [`B${i}`, 'C']),
      ...Array.from({ length: 10 }).map((_, i) => [`B${i}`, `C${i}`]),
      ...Array.from({ length: 10 }).map((_, i) => [`E`, `C${i}`]),
      ...Array.from({ length: 20 }).map(() => ['A', 'C']),
      ...Array.from({ length: 10 }).map(() => ['a', 'd']),
      ...Array.from({ length: 10 }).map(() => ['d', 'e']),
      ...Array.from({ length: 10 }).map(() => ['c', 'e']),
      ...Array.from({ length: 10 }).map(() => ['C', 'D']),
      ...Array.from({ length: 10 }).map(() => ['b', 'D']),
      ...Array.from({ length: 10 }).map(() => ['A', 'E']),
    ] as [string, string][]);
    fewMarkets = createDummyMarkets([
      ['A', 'B'],
      ['B', 'C'],
      ['B', 'C'],
      ['C', 'A'],
      ['C', 'A'],
      ['A', 'D'],
      ['C', 'D'],
    ]);
  });

  it('Test creation of triangles', function () {
    const group = groupEthMarkets(
      createDummyMarkets([
        ['A', 'B'],
        ['B', 'C'],
        ['B', 'C'],
        ['C', 'A'],
        ['C', 'A'],
        ['C', 'D'],
      ]),
    );
    const nangles = createTriangles('A', group);
    printNangles(nangles);
    expect(nangles.length).equal(8);
  });

  it('Test creation of nangles N = 2', function () {
    startTime('nangles');
    const duoangles = createNanglesUsingGraph(['A'], [2], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    startTime('nangles');
    const nangles = createNangles(['A'], [2], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    console.log('----');
    console.log(duoangles.length);
    expect(duoangles.length).equal(nangles.length);
  });

  it('Test creation of nangles N = 3', function () {
    startTime('nangles');
    const triangles = createNanglesUsingGraph(['A'], [3], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    startTime('nangles');
    const nangles = createNangles(['A'], [3], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    console.log('----');
    console.log(triangles.length);
    expect(triangles.length).equal(nangles.length);
  });

  it('Test creation of nangles N = 4', function () {
    startTime('nangles');
    const quadangles = createNanglesUsingGraph(['A'], [4], groupEthMarkets(markets)); /*.filter(
      (nangle) => {
        let middleToken = nangle.startToken;

        for (let i = 0; i < 2; i++) {
          middleToken =
            nangle.markets[i].tokens[0] !== middleToken
              ? nangle.markets[i].tokens[0]
              : nangle.markets[i].tokens[1];
        }

        return nangle.startToken !== middleToken;
      },
    )*/
    console.log(endTime('nangles'));
    startTime('nangles');
    const nangles = createNangles(['A'], [4], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    console.log('----');
    //printNangles(quadangles);
    console.log('----');
    //printNangles(nangles);
    console.log(quadangles.length);
    console.log(nangles.length);
    expect(quadangles.length).equal(nangles.length);
  });

  it('Test WTF', function () {
    const group = groupEthMarkets(realMarkets.filter((m: EthMarket) => m.protocol === 'uniswapV3'));
    const start = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    startTime();
    console.log(group.markets.length);
    const oldNangles = createQuadangles(start, group);
    console.log('old', endTime());
    const newNangles = []; //createNanglesUsingGraph([start], [4], group);
    console.log('new', endTime());

    /*    function nangleToStr(nangle: Nangle): string {
      return nangle.markets.map(m => m.marketAddress).join(',');
    }

    const newNanglesSet = new Set<string>(newNangles.map(n => nangleToStr(n)));
    let missingMarkets: EthMarket[] = [];
    let missingNangles: Nangle[] = [];
    for (const nangle of oldNangles) {
      if (!newNanglesSet.has(nangleToStr(nangle))) {
        missingNangles.push(nangle);
        nangle.markets.forEach(m => {
          missingMarkets = Array.from(new Set([...missingMarkets, m]));
        })
      }
    }*/

    console.log(oldNangles.length, 'vs', newNangles.length);
    expect(oldNangles.length).equal(newNangles.length);
  });
});

function printNangles(nangles: Nangle[]) {
  const allMarkets = nangles.reduce((acc, i) => [...acc, ...i.markets], [] as EthMarket[]);
  const allTokens = Object.keys(groupEthMarkets(allMarkets).marketsByToken);

  let id = 0;
  const dictionary = allTokens.reduce((acc, token) => {
    acc[token] = `${++id}`;
    return acc;
  }, {} as Record<Address, string>);

  id = 0;
  const marketAddresses = Array.from(new Set(allMarkets.map((market) => market.marketAddress)));
  const marketDictionary = marketAddresses.reduce((acc, address) => {
    acc[address] = `M${++id}`;
    return acc;
  }, {} as Record<Address, string>);

  function tokenName(address: string) {
    if (address.length < 500) {
      return address.slice(0, 6);
    }

    return dictionary[address];
  }

  function marketName(address: string) {
    if (address.length < 500) {
      return address.slice(0, 6);
    }

    return marketDictionary[address];
  }

  for (let i = 0; i < nangles.length; i++) {
    let prevToken = nangles[i].startToken;
    let label = tokenName(prevToken);

    for (let j = 0; j < nangles[i].markets.length; j++) {
      const market = nangles[i].markets[j];
      let nextToken = market.tokens[0] !== prevToken ? market.tokens[0] : market.tokens[1];
      label += ` > (${marketName(market.marketAddress)}) > ${tokenName(nextToken)}`;
      prevToken = nextToken;
    }

    console.log(`${i + 1}: ${label}`);
  }
}

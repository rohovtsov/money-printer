import {
  createNangles,
  createNanglesUsingGraph,
  createTriangles,
  Nangle,
} from '../src/triangle/nangle';
import { Address, endTime, EthMarket, groupEthMarkets, startTime } from '../src/entities';
import { createDummyMarkets } from './entities/dummy-market';
import { expect } from 'chai';

describe('NangleTest', function () {
  let markets: EthMarket[];
  let fewMarkets: EthMarket[];
  this.timeout(100000000);

  beforeEach(() => {
    markets = createDummyMarkets([
      ...Array.from({ length: 40000 }).map((_, i) => ['A', `B${i}`]),
      ...Array.from({ length: 40 }).map((_, i) => [`B${i}`, 'C']),
      ...Array.from({ length: 20 }).map(() => ['A', 'C']),
      ...Array.from({ length: 10 }).map(() => ['A', 'C']),
      /*['C', 'D'],
      ['A', 'D'],*/
    ] as [string, string][]);
    fewMarkets = createDummyMarkets([
      ['A', 'B'],
      ['B', 'C'],
      ['B', 'C'],
      ['C', 'A'],
      ['C', 'A'],
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
    const quadangles = createNanglesUsingGraph(['A'], [4], groupEthMarkets(markets)).filter(
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
    );
    console.log(endTime('nangles'));
    startTime('nangles');
    const nangles = createNangles(['A'], [4], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    console.log('----');
    //printNangles(quadangles);
    console.log('----');
    //printNangles(nangles);
    console.log(quadangles.length);
    expect(quadangles.length).equal(nangles.length);
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
    if (address.length < 5) {
      return address;
    }

    return dictionary[address];
  }

  function marketName(address: string) {
    if (address.length < 5) {
      return address;
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

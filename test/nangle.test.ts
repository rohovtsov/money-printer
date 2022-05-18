import { createNangles, createNanglesOpti, createTriangles, Nangle } from '../src/triangle/nangle';
import { Address, endTime, EthMarket, groupEthMarkets, startTime } from '../src/entities';
import { createDummyMarkets } from './entities/dummy-market';
import { expect } from 'chai';

describe('NangleTest', function () {
  this.timeout(10000);

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
    const nangles = createTriangles(['A'], group);
    printNangles(nangles);
    expect(nangles.length).equal(8);
  });

  it('Test creation of nangles and triangles', function () {
    /*const group = groupEthMarkets(createDummyMarkets([
      ['A', 'B'],
      ['B', 'A'],
      ['B', 'A'],
      ['B', 'C'],
    ]));
    const nangles = createNangles(['A'], group, 2);
    printNangles(nangles);*/
    const markets = createDummyMarkets([
      ...Array.from({ length: 40000 }).map((_, i) => ['A', `B${i}`]),
      ...Array.from({ length: 4000 }).map((_, i) => [`B${i}`, 'C']),
      ...Array.from({ length: 100 }).map(() => ['A', 'C']),
      ...Array.from({ length: 100 }).map(() => ['A', 'C']),
    ] as [string, string][]);

    startTime('nangles');
    const triangles = createTriangles(['A'], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    startTime('nangles');
    const nangles = createNangles(['A'], [3], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    startTime('nangles');
    const nanglesOpti = createNanglesOpti(['A'], [3], groupEthMarkets(markets));
    console.log(endTime('nangles'));
    console.log('----');
    /*printNangles(triangles);
    printNangles(nangles);*/
    expect(triangles.length).equal(nangles.length);
    expect(nanglesOpti.length).equal(nangles.length);
  });

  it('Test creation of nangles 2', function () {
    const group = groupEthMarkets(
      createDummyMarkets([
        ['A', 'B'],
        ['B', 'C'],
        ['B', 'C'],
        ['C', 'A'],
        ['C', 'A'],
        ['C', 'A'],
        ['C', 'D'],
      ]),
    );
    const nangles = createNangles(['A'], [2], group);
    printNangles(nangles);
    //console.log(nangles);
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

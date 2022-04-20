import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  EthMarket,
  GroupedEthMarkets,
  groupEthMarkets, WETH_ADDRESS
} from '../entities';



type TrianglesByMarketAddress = Record<Address, Triangle[]>;

interface Triangle {
  markets: [EthMarket, EthMarket, EthMarket];
}


export class TriangleArbitrageStrategy implements ArbitrageStrategy {
  triangles: Triangle[];
  trianglesByMarket: TrianglesByMarketAddress;

  constructor(startingTokens: Address[], group: GroupedEthMarkets) {
    this.triangles = createTriangles(startingTokens, group);
    this.trianglesByMarket = this.triangles.reduce((acc, triangle) => {
      for (const market of triangle.markets) {
        (acc[market.marketAddress] ?? (acc[market.marketAddress] = [])).push(triangle);
      }
      return acc;
    }, {} as TrianglesByMarketAddress);
  }

  getArbitrageOpportunities(changedMarkets: EthMarket[], allMarkets: EthMarket[]): ArbitrageOpportunity[] {
    const changedTriangles = filterChangedTriangles(changedMarkets, this.trianglesByMarket);
    return changedTriangles.map(this.calculateOpportunity.bind(this)).filter(Boolean) as ArbitrageOpportunity[];
  }

  calculateOpportunity(triangle: Triangle): ArbitrageOpportunity | null {
    //TODO: calculate opportunity
    return null;
  }
}


function filterChangedTriangles(changedMarkets: EthMarket[], trianglesByMarket: TrianglesByMarketAddress): Triangle[] {
  const changedTriangles: Set<Triangle> = new Set<Triangle>();

  for (const market of changedMarkets) {
    const triangles = (trianglesByMarket[market.marketAddress] ?? []);

    for (const triangle of triangles) {
      changedTriangles.add(triangle);
    }
  }

  return Array.from(changedTriangles);
}


/**
 m1, m2, m3 = markets
 group1 = group of markets with firstToken
 group2 = group of markets without firstToken

 Triangle Schema:
 tokenA => m1 => tokenB => m2 => tokenC => m3 => tokenA

 m1 e group1 (with start)
 m2 e group2 (without start)
 m3 e group1, but m3 !== m1
 */
function createTriangles(startingTokens: Address[], group: GroupedEthMarkets): Triangle[] {
  const triangles: Triangle[] = [];

  for (const tokenA of startingTokens) {
    const group1 = groupEthMarkets(group.marketsByToken[tokenA]);
    const group2 = groupEthMarkets(
      group.markets
        .filter((market => market.tokens[0] !== tokenA && market.tokens[1] !== tokenA))
    );

    for (const market1 of group1.markets) {
      const tokenB = market1.tokens[0] !== tokenA ? market1.tokens[0] : market1.tokens[1];

      if (!group2.marketsByToken[tokenB]) {
        continue;
      }

      for (const market2 of group2.marketsByToken[tokenB]) {
        const tokenC = market2.tokens[0] !== tokenB ? market2.tokens[0] : market2.tokens[1];

        if (!group1.marketsByToken[tokenC]) {
          continue;
        }

        for (const market3 of group1.marketsByToken[tokenC]) {
          if (market3 === market1) {
            continue;
          }

          triangles.push({ markets: [market1, market2, market3] });
        }
      }
    }
  }

  return triangles;
}


function printTriangles(markets: Triangle[]) {
  const allMarkets = markets.reduce((acc, i) => [...acc, ...i.markets], [] as EthMarket[]);
  const allTokens = Object.keys(groupEthMarkets(allMarkets).marketsByToken);

  let id = 0;
  const dictionary = allTokens.reduce((acc, token) => {
    acc[token] = `${++id}`;
    return acc;
  }, {} as Record<Address, string>);

  id = 0;
  const marketAddresses = Array.from(new Set(allMarkets.map(market => market.marketAddress)));
  const marketDictionary = marketAddresses.reduce((acc, address) => {
    acc[address] = `M${++id}`;
    return acc;
  }, {} as Record<Address, string>);


  for (let i = 0; i < markets.length; i++) {
    let prevToken = WETH_ADDRESS;
    let label = dictionary[prevToken];

    for (let j = 0; j < markets[i].markets.length; j++) {
      const market = markets[i].markets[j];
      let nextToken = market.tokens[0] !== prevToken ? market.tokens[0] : market.tokens[1];
      label += ` > ${dictionary[nextToken]} (${marketDictionary[market.marketAddress]})`;
      prevToken = nextToken;
    }

    console.log(`${i + 1}: ${label}`);
  }
}

import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  EthMarket,
  GroupedEthMarkets,
  groupEthMarkets, WETH_ADDRESS
} from '../entities';

interface Triangle {
  markets: [EthMarket, EthMarket, EthMarket];
}
//
// export interface ArbitrageStrategy {
//   findMarkets(changedMarkets: EthMarket, AllTriangles: EthMarket[];
// }


// только тут вставь адрес кефира
const KEFIR_TOKEN = WETH_ADDRESS; // ADDRESS ВСТАВЬ


function findMarkets2( allMarkets: GroupedEthMarkets): EthMarket[][]  {
  const resultsMap = new Map();

  for (let market1 of allMarkets.markets) {
    for (let market2 of allMarkets.markets) {
      for (let market3 of allMarkets.markets) {
        if (market1 === market2 || market2 === market3 || market1 === market3) {
          continue;
        }
        if (!market1.tokens.includes(KEFIR_TOKEN) || !market3.tokens.includes(KEFIR_TOKEN)) {
          continue;
        }
        // if (market1 !== market2 && market2 !== market3 && market1 !== market3) {
        //   if (market1.tokens.includes(KEFIR_TOKEN) && market3.tokens.includes(KEFIR_TOKEN)) {
            const market1OtherToken = market1.tokens.find(t => t !== KEFIR_TOKEN);
            const market3OtherToken = market3.tokens.find(t => t !== KEFIR_TOKEN);
            // console.log('>>>>', market1OtherToken,  market3OtherToken) //
            if (market1OtherToken && market3OtherToken && market1OtherToken !== market3OtherToken && market2.tokens.includes(market1OtherToken) && market2.tokens.includes(market3OtherToken)) {
              const market2OtherToken = market2.tokens.find(t => t !== market1OtherToken && t != market3OtherToken);
              if (market2OtherToken == null) {
                // const resultKey = `${market1OtherToken}_${market3OtherToken}`;
                const resultKey = [market1.marketAddress, market2.marketAddress, market3.marketAddress].sort().join('_');
                // console.log(resultKey);
/*
                14: 2 > 63.4 > 62.1 > 54.2
                15: 2 > 63.4 > 62.1 > 64.2
                Они не одинаковые!!!!!
                Цепочка токенов одинаковая
                А цепочка рынков типо нет
*/


                if (!resultsMap.has(resultKey)) {
                  resultsMap.set(resultKey, [market1, market2, market3]);
                  // console.log('>>>', market1.tokens, market2.tokens, market3.tokens, market1OtherToken, market3OtherToken);
                }
              }
            }
          // }
        // }
      }
    }
  }

  return Array.from(resultsMap.values());
}

export function createTriangles(startingTokens: Address[], group: GroupedEthMarkets): EthMarket[][] {
  const triangles: EthMarket[][] = [];

/*
  tokenA e group1 (with start)
  tokenB e group2 (without start)
  tokenC e group3 (group)

  [group1] => [group2] => [group3] => [group1]
  tokenA => [....] => [.....] => tokenA

  m1 e group1 (with start)
  m2 e group2 (without start)
  m3 e group1 m1 !== m3

  tokenA => m1 => tokenB => m2 => tokenC => m3 => tokenA
*/

  for (const tokenA of startingTokens) {
    const group1 = groupEthMarkets(group.marketsByToken[tokenA]);
    const group2 = groupEthMarkets(
      group.markets
        .filter((market => market.tokens[0] !== tokenA && market.tokens[1] !== tokenA))
    );

    console.log(group1.markets.length);
    console.log(group2.markets.length);

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

          triangles.push([market1, market2, market3]);
        }
      }
    }
  }

  return triangles;
}

function printTriangles(markets: EthMarket[][]) {
  const allMarkets = markets.reduce((acc, i) => [...acc, ...i], [] as EthMarket[]);
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

    for (let j = 0; j < markets[i].length; j++) {
      const market = markets[i][j];
      let nextToken = market.tokens[0] !== prevToken ? market.tokens[0] : market.tokens[1];
      label += ` > ${dictionary[nextToken]} (${marketDictionary[market.marketAddress]})`;
      prevToken = nextToken;
    }

    console.log(`${i + 1}: ${label}`);
  }
}


export class TriangleArbitrageStrategy implements ArbitrageStrategy {
  triangles: Triangle[];

  // все давай а не 300
  // мы погибнем
  // вот тебе 2173
  // давай потестим 10 лучше
  constructor(startingTokens: Address[], group: GroupedEthMarkets) {
    console.time();
    const triangles1 = createTriangles([WETH_ADDRESS], group);
    console.log(triangles1.length);
    printTriangles(triangles1);
    console.timeEnd();

    console.time();
    const triangles2 = findMarkets2(group);
    printTriangles(triangles2);
    // где эта строка?

    console.log('>>> triangles', triangles2.length, 'all counts', group.markets.length);
    console.timeEnd();

    this.triangles = [];
  }

  getArbitrageOpportunities(changedMarkets: EthMarket[], allMarkets: EthMarket[]): ArbitrageOpportunity[] {
    return [];
  }
}

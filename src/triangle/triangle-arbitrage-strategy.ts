import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  EthMarket,
  GroupedEthMarkets,
  groupEthMarkets,
  MarketAction,
  printOpportunity,
  WETH_ADDRESS,
} from '../entities';
import { BigNumber } from 'ethers';

export type TriangleStartOptions = Record<Address, BigNumber[]>;

type TrianglesByMarketAddress = Record<Address, Triangle[]>;

interface Triangle {
  markets: [EthMarket, EthMarket, EthMarket];
  actions: [MarketAction, MarketAction, MarketAction];
  startToken: Address;
}

export class TriangleArbitrageStrategy implements ArbitrageStrategy {
  options: TriangleStartOptions;
  triangles: Triangle[];
  trianglesByMarket: TrianglesByMarketAddress;

  constructor(options: TriangleStartOptions, markets: EthMarket[]) {
    const group = groupEthMarkets(markets);
    this.options = options;
    this.triangles = createTriangles(Object.keys(options), group);
    this.trianglesByMarket = this.triangles.reduce((acc, triangle) => {
      for (const market of triangle.markets) {
        (acc[market.marketAddress] ?? (acc[market.marketAddress] = [])).push(triangle);
      }
      return acc;
    }, {} as TrianglesByMarketAddress);
  }

  getArbitrageOpportunities(
    changedMarkets: EthMarket[],
    allMarkets: EthMarket[],
    blockNumber: number,
  ): ArbitrageOpportunity[] {
    const changedTriangles = filterChangedTriangles(changedMarkets, this.trianglesByMarket);
    console.log(`Changed triangles ${changedTriangles.length}`);
    return changedTriangles
      .map((triangle) => this.calculateOpportunity(triangle, blockNumber))
      .filter(Boolean) as ArbitrageOpportunity[];
  }

  calculateOpportunity(triangle: Triangle, blockNumber: number): ArbitrageOpportunity | null {
    return this.options[triangle.startToken].reduce((acc, startAmount) => {
      const opportunity = this.calculateOpportunityForAmount(triangle, startAmount, blockNumber);

      if (opportunity && (!acc || opportunity.profit.gt(acc.profit))) {
        acc = opportunity;
      }

      return acc;
    }, null as ArbitrageOpportunity | null);
  }

  calculateOpportunityForAmount(
    triangle: Triangle,
    startAmount: BigNumber,
    blockNumber: number,
  ): ArbitrageOpportunity | null {
    const amounts: BigNumber[] = [startAmount];
    let amount: BigNumber = startAmount;

    //console.log(triangle.actions, startAmount?.toString());

    for (let i = 0; i < triangle.markets.length; i++) {
      const market = triangle.markets[i];
      const action = triangle.actions[i];
      const nextAmount = market.calcTokensOut(action, amount);

      // if (nextAmount.gt(triangle.markets[i].))

      if (nextAmount !== null) {
        amount = nextAmount;
        amounts.push(nextAmount);
      } else {
        return null;
      }
    }

    /*console.log(Number(amount?.toString()) / (10**18), Number(startAmount?.toString()) / (10**18))
    printOpportunity({
      strategyName: 'triangle',
      operations: triangle.markets.map((market, id) => {
        return { market, amountIn: amounts[id], amountOut: amounts[id + 1], action: triangle.actions[id] };
      }),
      profit: amount.sub(startAmount),
      startToken: triangle.startToken,
    });*/

    if (!amount.gt(startAmount)) {
      return null;
    }

    return {
      blockNumber,
      strategyName: 'triangle',
      operations: triangle.markets.map((market, id) => {
        return {
          market,
          tokenIn:
            triangle.actions[id] === 'buy'
              ? triangle.markets[id].tokens[1]
              : triangle.markets[id].tokens[0],
          tokenOut:
            triangle.actions[id] === 'buy'
              ? triangle.markets[id].tokens[0]
              : triangle.markets[id].tokens[1],
          amountIn: amounts[id],
          amountOut: amounts[id + 1],
          action: triangle.actions[id],
        };
      }),
      profit: amount.sub(startAmount),
      startToken: triangle.startToken,
    };
  }
}

function filterChangedTriangles(
  changedMarkets: EthMarket[],
  trianglesByMarket: TrianglesByMarketAddress,
): Triangle[] {
  const changedTriangles: Set<Triangle> = new Set<Triangle>();

  for (const market of changedMarkets) {
    const triangles = trianglesByMarket[market.marketAddress] ?? [];

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
      group.markets.filter((market) => market.tokens[0] !== tokenA && market.tokens[1] !== tokenA),
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

          triangles.push({
            startToken: tokenA,
            markets: [market1, market2, market3],
            actions: [
              market1.tokens[0] === tokenA ? 'sell' : 'buy',
              market2.tokens[0] === tokenB ? 'sell' : 'buy',
              market3.tokens[0] === tokenC ? 'sell' : 'buy',
            ],
          });
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
  const marketAddresses = Array.from(new Set(allMarkets.map((market) => market.marketAddress)));
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

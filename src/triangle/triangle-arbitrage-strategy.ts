import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  EthMarket,
  groupEthMarkets,
  MarketAction,
} from '../entities';
import { createNangles, filterNanglesByMarkets, groupNanglesByMarkets } from './nangle';

export type TriangleStartOptions = Record<Address, bigint[]>;

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
    this.triangles = createNangles(Object.keys(options), [3], group) as Triangle[];
    this.trianglesByMarket = groupNanglesByMarkets(this.triangles) as TrianglesByMarketAddress;
  }

  getArbitrageOpportunities(
    changedMarkets: EthMarket[],
    allMarkets: EthMarket[],
    blockNumber: number,
  ): ArbitrageOpportunity[] {
    const changedTriangles = filterNanglesByMarkets(
      this.trianglesByMarket,
      changedMarkets,
    ) as Triangle[];
    console.log(`Changed triangles ${changedTriangles.length}`);
    return changedTriangles
      .map((triangle) => this.calculateOpportunity(triangle, blockNumber))
      .filter(Boolean) as ArbitrageOpportunity[];
  }

  calculateOpportunity(triangle: Triangle, blockNumber: number): ArbitrageOpportunity | null {
    return this.options[triangle.startToken].reduce((acc, startAmount) => {
      const opportunity = this.calculateOpportunityForAmount(triangle, startAmount, blockNumber);

      if (opportunity && (!acc || opportunity.profit > acc.profit)) {
        acc = opportunity;
      }

      return acc;
    }, null as ArbitrageOpportunity | null);
  }

  calculateOpportunityForAmount(
    triangle: Triangle,
    startAmount: bigint,
    blockNumber: number,
  ): ArbitrageOpportunity | null {
    const amounts: bigint[] = [startAmount];
    let amount = startAmount;

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

    if (amount <= startAmount) {
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
      profit: amount - startAmount,
      startToken: triangle.startToken,
    };
  }
}

import { BigNumber } from 'ethers';
import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  EthMarket,
  GroupedEthMarkets,
  groupEthMarkets,
  MarketAction,
} from '../entities';
import { UniswapV2Market } from '../uniswap/uniswap-v2-market';

export type NangleStartOptions = { startAddresses: Address[] };

type NanglesByMarketAddress = Record<Address, Nangle[]>;

interface Nangle {
  markets: UniswapV2Market[];
  actions: MarketAction[];
  startToken: Address;
}

const d1000 = BigNumber.from(1000);
const d997 = BigNumber.from(997);

export class UniswapV2ArbitrageStrategy implements ArbitrageStrategy {
  nangles: Nangle[];
  nanglesByMarket: NanglesByMarketAddress;

  constructor(options: NangleStartOptions, markets: EthMarket[]) {
    const v2Markets = markets.filter((m) => m.protocol === 'uniswapV2');
    const group = groupEthMarkets(v2Markets);
    this.nangles = createNangles(options.startAddresses, group, 3, 3);
    this.nanglesByMarket = this.nangles.reduce((acc, triangle) => {
      for (const market of triangle.markets) {
        (acc[market.marketAddress] ?? (acc[market.marketAddress] = [])).push(triangle);
      }
      return acc;
    }, {} as NanglesByMarketAddress);
  }

  getArbitrageOpportunities(
    changedMarkets: EthMarket[],
    allMarkets: EthMarket[],
    blockNumber: number,
  ): ArbitrageOpportunity[] {
    const changedTriangles = filterChangedNangles(changedMarkets, this.nanglesByMarket);
    console.log(`Changed triangles ${changedTriangles.length}`);
    return changedTriangles
      .map((triangle) => this.calculateOpportunity(triangle, blockNumber))
      .filter(Boolean) as ArbitrageOpportunity[];
  }

  calculateOpportunity(triangle: Nangle, blockNumber: number): ArbitrageOpportunity | null {
    const [Ea, Eb] = this.getEaEb(triangle.startToken, triangle.markets);
    const optimalAmount = this.getOptimalAmount(Ea, Eb);
    if (!optimalAmount) {
      return null;
    }
    return this.calculateOpportunityForAmount(triangle, optimalAmount, blockNumber);
  }

  calculateOpportunityForAmount(
    triangle: Nangle,
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

  private getEaEb(tokenIn: Address, markets: UniswapV2Market[]): [BigNumber, BigNumber] {
    let Ea: BigNumber | null = null;
    let Eb: BigNumber | null = null;
    let tokenOut = tokenIn;
    for (let idx = 0; idx < markets.length; idx++) {
      let pair = markets[idx];
      if (idx == 0) {
        if (tokenIn == pair.tokens[0]) {
          tokenOut = pair.tokens[1];
        } else {
          tokenOut = pair.tokens[0];
        }
      }
      if (idx == 1) {
        let Ra = markets[0].getReserve0();
        let Rb = markets[0].getReserve1();
        if (Ra.eq(0) || Rb.eq(0)) {
          return [BigNumber.from(0), BigNumber.from(0)];
        }
        if (tokenIn == markets[0].tokens[0]) {
          let temp = Ra;
          Ra = Rb;
          Rb = temp;
        }
        let Rb1 = pair.getReserve0();
        let Rc = pair.getReserve1();
        if (Rb1.eq(0) || Rc.eq(0)) {
          return [BigNumber.from(0), BigNumber.from(0)];
        }
        if (tokenOut == pair.tokens[1]) {
          let temp = Rb1;
          Rb1 = Rc;
          Rc = temp;
          tokenOut = pair.tokens[0];
        } else {
          tokenOut = pair.tokens[1];
        }
        Ea = d1000
          .mul(Ra)
          .mul(Rb1)
          .div(d1000.mul(Rb1).add(d997.mul(Rb))); // toInt((d1000 * Ra * Rb1) / (d1000 * Rb1 + d997 * Rb));
        Eb = d997
          .mul(Rb)
          .mul(Rc)
          .div(d1000.mul(Rb1).add(d997.mul(Rb))); // toInt((d997 * Rb * Rc) / (d1000 * Rb1 + d997 * Rb));
      }
      if (idx > 1) {
        let Ra: BigNumber | null = Ea;
        let Rb: BigNumber | null = Eb;
        let Rb1 = pair.getReserve0();
        let Rc = pair.getReserve1();
        if (Rb1.eq(0) || Rc.eq(0)) {
          return [BigNumber.from(0), BigNumber.from(0)];
        }
        if (tokenOut == pair.tokens[1]) {
          let temp = Rb1;
          Rb1 = Rc;
          Rc = temp;
          tokenOut = pair.tokens[0];
        } else {
          tokenOut = pair.tokens[1];
        }
        Ea = d1000
          .mul(Ra!)
          .mul(Rb1)
          .div(d1000.mul(Rb1).add(d997.mul(Rb!))); // toInt((d1000 * Ra * Rb1) / (d1000 * Rb1 + d997 * Rb));
        Eb = d997
          .mul(Rb!)
          .mul(Rc)
          .div(d1000.mul(Rb1).add(d997.mul(Rb!))); // toInt((d997 * Rb * Rc) / (d1000 * Rb1 + d997 * Rb));
      }
    }
    return [Ea!, Eb!];
  }

  private getOptimalAmount(Ea: BigNumber, Eb: BigNumber): BigNumber | null {
    if (Ea > Eb) {
      return null;
    }
    return this.sqrt(Ea.mul(Eb).mul(d997).mul(d1000)).sub(Ea.mul(d1000)).div(d997); // Decimal(int((Decimal.sqrt(Ea*Eb*d997*d1000)-Ea*d1000)/d997))
  }

  private sqrt(x: BigNumber): BigNumber {
    const ONE = BigNumber.from(1);
    const TWO = BigNumber.from(2);
    let z = x.add(ONE).div(TWO);
    let y = x;
    while (z.sub(y).isNegative()) {
      y = z;
      z = x.div(z).add(z).div(TWO);
    }
    return y;
  }
}

function filterChangedNangles(
  changedMarkets: EthMarket[],
  trianglesByMarket: NanglesByMarketAddress,
): Nangle[] {
  const changedTriangles: Set<Nangle> = new Set<Nangle>();

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
function createNangles(
  startingTokens: Address[],
  group: GroupedEthMarkets,
  min = 2,
  max = 4,
): Nangle[] {
  const triangles: Nangle[] = [];

  // TODO rohovtsov: нагенерировать не только пары по 3, но так же по 2 и по 4
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
            markets: [market1, market2, market3] as UniswapV2Market[],
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

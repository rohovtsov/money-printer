import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  endTime,
  EthMarket,
  groupEthMarkets,
  startTime,
} from '../entities';
import { UniswapV2Market } from '../uniswap/uniswap-v2-market';
import {
  createNangles,
  filterNanglesByMarkets,
  groupNanglesByMarkets,
  Nangle,
  nangleCountsToString,
} from './nangle';

export type NangleStartOptions = { startAddresses: Address[] };

const d1000 = BigInt(1000);
const d997 = BigInt(997);

export class UniswapV2ArbitrageStrategy implements ArbitrageStrategy {
  nangles: Nangle[];
  nanglesByMarket: Record<Address, Nangle[]>;

  constructor(options: NangleStartOptions, markets: EthMarket[]) {
    const v2Markets = markets.filter((m) => m.protocol === 'uniswapV2');
    startTime('nangles');
    this.nangles = createNangles<UniswapV2Market>(
      options.startAddresses,
      [2, 3],
      groupEthMarkets(v2Markets),
    );
    this.nanglesByMarket = groupNanglesByMarkets(this.nangles);
    console.log(
      `Created nangles for V2 only - ${nangleCountsToString(this.nangles)} - in ${endTime(
        'nangles',
      )}ms`,
    );
  }

  getArbitrageOpportunities(
    changedMarkets: EthMarket[],
    allMarkets: EthMarket[],
    blockNumber: number,
  ): ArbitrageOpportunity[] {
    const changedNangles = filterNanglesByMarkets(this.nanglesByMarket, changedMarkets);
    console.log(`Changed nangles V2 only: ${changedNangles.length}`);
    return changedNangles
      .map((nangle) => this.calculateOpportunity(nangle, blockNumber))
      .filter(Boolean) as ArbitrageOpportunity[];
  }

  calculateOpportunity(nangle: Nangle, blockNumber: number): ArbitrageOpportunity | null {
    const [Ea, Eb] = this.getEaEb(nangle.startToken, nangle.markets as UniswapV2Market[]);
    const optimalAmount = this.getOptimalAmount(Ea, Eb);
    if (!optimalAmount) {
      return null;
    }
    return this.calculateOpportunityForAmount(nangle, optimalAmount, blockNumber);
  }

  calculateOpportunityForAmount(
    nangle: Nangle,
    startAmount: bigint,
    blockNumber: number,
  ): ArbitrageOpportunity | null {
    const amounts: bigint[] = [startAmount];
    let amount = startAmount;

    for (let i = 0; i < nangle.markets.length; i++) {
      const market = nangle.markets[i];
      const action = nangle.actions[i];
      const nextAmount = market.calcTokensOut(action, amount);

      if (nextAmount !== null) {
        amount = nextAmount;
        amounts.push(nextAmount);
      } else {
        return null;
      }
    }

    if (amount <= startAmount) {
      return null;
    }

    return {
      blockNumber,
      strategyName: 'uniswap-v2',
      operations: nangle.markets.map((market, id) => {
        return {
          market,
          tokenIn:
            nangle.actions[id] === 'buy'
              ? nangle.markets[id].tokens[1]
              : nangle.markets[id].tokens[0],
          tokenOut:
            nangle.actions[id] === 'buy'
              ? nangle.markets[id].tokens[0]
              : nangle.markets[id].tokens[1],
          amountIn: amounts[id],
          amountOut: amounts[id + 1],
          action: nangle.actions[id],
        };
      }),
      profit: amount - startAmount,
      startToken: nangle.startToken,
    };
  }

  private getEaEb(tokenIn: Address, markets: UniswapV2Market[]): [bigint, bigint] {
    let Ea: bigint | null = null;
    let Eb: bigint | null = null;
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
        if (Ra === 0n || Rb === 0n) {
          return [0n, 0n];
        }
        if (tokenIn == markets[0].tokens[0]) {
          let temp = Ra;
          Ra = Rb;
          Rb = temp;
        }
        let Rb1 = pair.getReserve0();
        let Rc = pair.getReserve1();
        if (Rb1 === 0n || Rc === 0n) {
          return [0n, 0n];
        }
        if (tokenOut == pair.tokens[1]) {
          let temp = Rb1;
          Rb1 = Rc;
          Rc = temp;
          tokenOut = pair.tokens[0];
        } else {
          tokenOut = pair.tokens[1];
        }
        // toInt((d1000 * Ra * Rb1) / (d1000 * Rb1 + d997 * Rb));
        Ea = (d1000 * Ra * Rb1) / (d1000 * Rb1 + d997 * Rb);
        // toInt((d997 * Rb * Rc) / (d1000 * Rb1 + d997 * Rb));
        Eb = (d997 * Rb * Rc) / (d1000 * Rb1 + d997 * Rb);
      }
      if (idx > 1) {
        let Ra: bigint | null = Ea;
        let Rb: bigint | null = Eb;
        let Rb1 = pair.getReserve0();
        let Rc = pair.getReserve1();
        if (Rb1 === 0n || Rc === 0n) {
          return [0n, 0n];
        }
        if (tokenOut == pair.tokens[1]) {
          let temp = Rb1;
          Rb1 = Rc;
          Rc = temp;
          tokenOut = pair.tokens[0];
        } else {
          tokenOut = pair.tokens[1];
        }
        // toInt((d1000 * Ra * Rb1) / (d1000 * Rb1 + d997 * Rb));
        Ea = (d1000 * Ra! * Rb1) / (d1000 * Rb1 + d997 * Rb!);
        // toInt((d997 * Rb * Rc) / (d1000 * Rb1 + d997 * Rb));
        Eb = (d997 * Rb! * Rc) / (d1000 * Rb1 + d997 * Rb!);
      }
    }
    return [Ea!, Eb!];
  }

  private getOptimalAmount(Ea: bigint, Eb: bigint): bigint | null {
    if (Ea > Eb) {
      return null;
    }
    // Decimal(int((Decimal.sqrt(Ea*Eb*d997*d1000)-Ea*d1000)/d997))
    return (this.sqrt(Ea * Eb * d997 * d1000) - Ea * d1000) / d997;
  }

  private sqrt(x: bigint): bigint {
    const ONE = 1n;
    const TWO = 2n;
    let z = (x + ONE) / TWO;
    let y = x;
    while (z - y < 0) {
      y = z;
      z = (x / z + z) / TWO;
    }
    return y;
  }
}

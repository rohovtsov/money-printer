import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  ArbitrageStrategyName,
  endTime,
  EthMarket,
  groupEthMarkets,
  startTime,
} from '../entities';
import {
  createNangles,
  filterNanglesByMarkets,
  groupNanglesByMarkets,
  Nangle,
  nangleCountsToString,
} from './nangle';
import { getExtremumInputAmount } from './profit-calculator';

type StartAmount = bigint | 'extremum';
export type FixedAmountStartOptions = Record<Address, StartAmount[]>;

export class FixedAmountArbitrageStrategy implements ArbitrageStrategy {
  options: FixedAmountStartOptions;
  nangles: Nangle[];
  nanglesByMarket: Record<Address, Nangle[]>;

  constructor(options: FixedAmountStartOptions, markets: EthMarket[]) {
    this.options = options;
    startTime('nangles');
    this.nangles = createNangles(Object.keys(options), [2, 3], groupEthMarkets(markets)).filter(
      (nangle) => nangle.markets.some((m) => m.protocol === 'uniswapV3'),
    );
    this.nanglesByMarket = groupNanglesByMarkets(this.nangles) as Record<Address, Nangle[]>;
    console.log(
      `Created nangles for V2 & V3 - ${nangleCountsToString(this.nangles)} - in ${endTime(
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
    console.log(`Changed nangles V2 & V3: ${changedNangles.length}`);
    return changedNangles
      .map((nangle) => {
        if (!this.hasLiquidity(nangle)) {
          return null;
        }
        /*if (opportunity?.operations?.reduce((acc, op) => acc + (op.market.protocol === 'uniswapV3' ? 1 : 0), 0) === 1) {
          saveNangle('nangle.json', nangle);
        }*/
        return this.calculateOpportunity(nangle, blockNumber);
      })
      .filter(Boolean) as ArbitrageOpportunity[];
  }

  hasLiquidity(nangle: Nangle): boolean {
    for (const market of nangle.markets) {
      if (!market.hasLiquidity()) {
        return false;
      }
    }

    return true;
  }

  calculateOpportunity(nangle: Nangle, blockNumber: number): ArbitrageOpportunity | null {
    return this.options[nangle.startToken].reduce((acc, startAmount) => {
      const name: ArbitrageStrategyName =
        startAmount === 'extremum' ? 'extremum-amount' : 'fixed-amount';
      const amount = startAmount === 'extremum' ? getExtremumInputAmount(nangle) : startAmount;

      if (!amount) {
        return acc;
      }

      const opportunity = this.calculateOpportunityForAmount(nangle, amount, blockNumber, name);

      if (opportunity && (!acc || opportunity.profit > acc.profit)) {
        acc = opportunity;
      }

      return acc;
    }, null as ArbitrageOpportunity | null);
  }

  calculateOpportunityForAmount(
    nangle: Nangle,
    startAmount: bigint,
    blockNumber: number,
    name: ArbitrageStrategyName,
  ): ArbitrageOpportunity | null {
    const amounts: bigint[] = [startAmount];
    let amount = startAmount;

    //console.log(nangle.actions, startAmount?.toString());

    for (let i = 0; i < nangle.markets.length; i++) {
      const market = nangle.markets[i];
      const action = nangle.actions[i];
      const nextAmount = market.calcTokensOut(action, amount);

      // if (nextAmount.gt(nangle.markets[i].))

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
      strategyName: name,
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
}

import {
  Address,
  ArbitrageOpportunity,
  ArbitrageStrategy,
  EthMarket,
  groupEthMarkets,
  MarketAction,
} from '../entities';
import { createNangles, filterNanglesByMarkets, groupNanglesByMarkets, Nangle } from './nangle';
import { saveNangle } from '../serializer';

export type TriangleStartOptions = Record<Address, bigint[]>;

export class TriangleArbitrageStrategy implements ArbitrageStrategy {
  options: TriangleStartOptions;
  nangles: Nangle[];
  nanglesByMarket: Record<Address, Nangle[]>;

  constructor(options: TriangleStartOptions, markets: EthMarket[]) {
    const group = groupEthMarkets(markets);
    this.options = options;
    this.nangles = createNangles(Object.keys(options), [2, 3], group);
    this.nanglesByMarket = groupNanglesByMarkets(this.nangles) as Record<Address, Nangle[]>;
  }

  getArbitrageOpportunities(
    changedMarkets: EthMarket[],
    allMarkets: EthMarket[],
    blockNumber: number,
  ): ArbitrageOpportunity[] {
    const changedNangles = filterNanglesByMarkets(this.nanglesByMarket, changedMarkets);
    console.log(`Changed nangles V2 & V3 ${changedNangles.length}`);
    return changedNangles
      .map((nangle) => {
        /*if (opportunity?.operations?.reduce((acc, op) => acc + (op.market.protocol === 'uniswapV3' ? 1 : 0), 0) === 1) {
          saveNangle('nangle.json', nangle);
        }*/
        return this.calculateOpportunity(nangle, blockNumber);
      })
      .filter(Boolean) as ArbitrageOpportunity[];
  }

  calculateOpportunity(nangle: Nangle, blockNumber: number): ArbitrageOpportunity | null {
    return this.options[nangle.startToken].reduce((acc, startAmount) => {
      const opportunity = this.calculateOpportunityForAmount(nangle, startAmount, blockNumber);

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

    /*console.log(Number(amount?.toString()) / (10**18), Number(startAmount?.toString()) / (10**18))
    printOpportunity({
      strategyName: 'triangle',
      operations: nangle.markets.map((market, id) => {
        return { market, amountIn: amounts[id], amountOut: amounts[id + 1], action: nangle.actions[id] };
      }),
      profit: amount.sub(startAmount),
      startToken: nangle.startToken,
    });*/

    if (amount <= startAmount) {
      return null;
    }

    return {
      blockNumber,
      strategyName: 'triangle',
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

import { BigNumber } from 'ethers';
import { Address, CallData, ETHER, EthMarket, GWEI, MarketAction, PriceCalculator } from '../entities';
import { SimpleUniswapV2Calculator } from './uniswap-v2-price-calculator';
const UniswapV3prices = require('@thanpolas/univ3prices');



export class UniswapV3Market implements EthMarket {
  readonly protocol = 'uniswapV3';
  readonly calculator: PriceCalculator;
  public sqrtPrice?: BigNumber;
  public tick?: number;
  private sellAmountOut?: BigNumber | null;
  private buyAmountOut?: BigNumber | null;
  private token0Price?: string | null;
  private token1Price?: string | null;

  constructor(
    readonly marketAddress: Address,
    readonly tokens: [Address, Address],
    readonly fee: number,
    readonly tickSpacing: number,
  ) {
    this.calculator = SimpleUniswapV2Calculator;
  }
/*

  calcTokensOut(action: MarketAction, amountIn: BigNumber): BigNumber | null {
    if (!this.sellAmountOut || !this.buyAmountOut) {
      return null;
    }

    console.log(action);
    console.log(amountIn?.toString(),
      (action === 'sell' ? this.sellAmountOut.mul(amountIn).div(GWEI) : this.buyAmountOut.mul(amountIn).div(GWEI)).toString()
      );
    console.log(this.buyAmountOut?.toString());
    console.log(this.sellAmountOut?.toString());
    return action === 'sell' ? this.sellAmountOut.mul(amountIn).div(GWEI) : this.buyAmountOut.mul(amountIn).div(GWEI);
  }
*/

  calcTokensOut(action: MarketAction, amountIn: BigNumber): BigNumber | null {
    if (!this.token0Price || !this.token1Price) {
      return null;
    }

    if (action === 'sell') {
      return BigNumber.from(Math.round((Number(amountIn?.toString()) * Number(this.token0Price))).toString());
    } else {
      return BigNumber.from(Math.round((Number(amountIn?.toString()) * Number(this.token1Price))).toString());
    }
  }

  calcTokensIn(action: MarketAction, amountOut: BigNumber): BigNumber | null {
    return null;
  }

  performSwap(amount: BigNumber, action: MarketAction): Promise<CallData> {
    throw new Error('Method not implemented.');
  }

/*  setPrices(sellAmountOut: BigNumber | null, buyAmountOut: BigNumber | null): void {
    this.sellAmountOut = sellAmountOut;
    this.buyAmountOut = buyAmountOut;
  }*/

  setState(tick: number, sqrtPrice: BigNumber, token0Price: string, token1Price: string) {
    this.tick = tick;
    this.sqrtPrice = sqrtPrice;
    this.token0Price = token0Price;
    this.token1Price = token1Price;
    //console.log(this.token1Price);
    //console.log(this.token0Price);
    /*const [token0Reserves, token1Reserves] = univ3prices.getAmountsForCurrentLiquidity(
      18, // decimals of DAI
      18, // decimals of WETH
      '2830981547246997099758055', // Current liquidity value of the pool
      '1550724133884968571999296281', // Current sqrt price value of the pool
      '60', // the tickSpacing value from the pool
    );*/
    //.tickRange(tick, this.tickSpacing));

    /*
    const univV3Prices = UniswapV3prices([0, 0], this.sqrtPrice);
    try {
      const token0PriceCalc = BigNumber.from(univV3Prices.toSignificant(100));
    } catch (e) {
      this.token0DivToken1 = undefined;
    }*/
  }
}

import { BigNumber } from 'ethers';
import { ChainId, Pair, Route, Token, TokenAmount, TradeType, Trade } from '@uniswap/sdk'
import { PriceCalculator } from '../entities';

export const SimpleUniswapV2Calculator: PriceCalculator = {
  getTokensIn(reserveIn: BigNumber, reserveOut: BigNumber, amountOut: BigNumber): BigNumber {
    const numerator: BigNumber = reserveIn.mul(amountOut).mul(1000);
    const denominator: BigNumber = reserveOut.sub(amountOut).mul(997);
    return numerator.div(denominator).add(1);
  },

  getTokensOut(reserveIn: BigNumber, reserveOut: BigNumber, amountIn: BigNumber): BigNumber {
    const amountInWithFee: BigNumber = amountIn.mul(997);
    const numerator = amountInWithFee.mul(reserveOut);
    const denominator = reserveIn.mul(1000).add(amountInWithFee);
    return numerator.div(denominator);
  }
};


export const SdkUniswapV2Calculator: PriceCalculator = {
  getTokensIn(reserveIn: BigNumber, reserveOut: BigNumber, amountOut: BigNumber): BigNumber {
    const tokenIn = new Token(ChainId.MAINNET, "0x0000000000000000000000000000000000000001", 18, "1");
    const tokenOut = new Token(ChainId.MAINNET, "0x0000000000000000000000000000000000000002", 18, "2");

    const pair = new Pair(
      new TokenAmount(tokenIn, reserveIn.toString()),
      new TokenAmount(tokenOut, reserveOut.toString()),
    );

    const route = new Route([pair], tokenIn, tokenOut);
    const trade = new Trade(route, new TokenAmount(tokenOut, amountOut.toString()), TradeType.EXACT_OUTPUT);
    return BigNumber.from(trade.inputAmount.raw.toString());
  },

  getTokensOut(reserveIn: BigNumber, reserveOut: BigNumber, amountIn: BigNumber): BigNumber {
    const tokenIn = new Token(ChainId.MAINNET, "0x0000000000000000000000000000000000000001", 18, "1");
    const tokenOut = new Token(ChainId.MAINNET, "0x0000000000000000000000000000000000000002", 18, "2");

    const pair = new Pair(
      new TokenAmount(tokenIn, reserveIn.toString()),
      new TokenAmount(tokenOut, reserveOut.toString()),
    );

    const route = new Route([pair], tokenIn, tokenOut);
    const trade = new Trade(route, new TokenAmount(tokenIn, amountIn.toString()), TradeType.EXACT_INPUT);
    return BigNumber.from(trade.outputAmount.raw.toString());
  }
}

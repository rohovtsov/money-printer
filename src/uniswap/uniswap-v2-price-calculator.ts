import { BigNumber } from 'ethers';
import { ChainId, Pair, Route, Token, TokenAmount, TradeType, Trade } from '@uniswap/sdk';
import { PriceCalculator } from '../entities';

export const NativeUniswapV2Calculator = {
  getTokensIn(reserveIn: bigint, reserveOut: bigint, amountOut: bigint): bigint | null {
    if (reserveIn <= 0n || reserveOut <= 0n || amountOut >= reserveOut || amountOut <= 0n) {
      //InsufficientReservesError
      return null;
    }

    const numerator = reserveIn * amountOut * 1000n;
    const denominator = (reserveOut - amountOut) * 997n;
    return numerator / denominator + 1n;
  },

  getTokensOut(reserveIn: bigint, reserveOut: bigint, amountIn: bigint): bigint | null {
    if (reserveIn <= 0 || reserveOut <= 0n || amountIn <= 0n) {
      //InsufficientReservesError
      return null;
    }

    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;
    const outputAmount = numerator / denominator;

    if (outputAmount === 0n) {
      //InsufficientInputAmountError;
      return null;
    }

    return outputAmount;
  },
};

export const SimpleUniswapV2Calculator: PriceCalculator = {
  getTokensIn(reserveIn: BigNumber, reserveOut: BigNumber, amountOut: BigNumber): BigNumber | null {
    if (reserveIn.lte(0) || reserveOut.lte(0) || amountOut.gte(reserveOut) || amountOut.lte(0)) {
      //InsufficientReservesError
      return null;
    }

    const numerator: BigNumber = reserveIn.mul(amountOut).mul(1000);
    const denominator: BigNumber = reserveOut.sub(amountOut).mul(997);
    return numerator.div(denominator).add(1);
  },

  getTokensOut(reserveIn: BigNumber, reserveOut: BigNumber, amountIn: BigNumber): BigNumber | null {
    if (reserveIn.lte(0) || reserveOut.lte(0) || amountIn.lte(0)) {
      //InsufficientReservesError
      return null;
    }

    const amountInWithFee: BigNumber = amountIn.mul(997);
    const numerator = amountInWithFee.mul(reserveOut);
    const denominator = reserveIn.mul(1000).add(amountInWithFee);
    const outputAmount = numerator.div(denominator);

    if (outputAmount.eq(0)) {
      //InsufficientInputAmountError;
      return null;
    }

    return outputAmount;
  },
};

export const SdkUniswapV2Calculator: PriceCalculator = {
  getTokensIn(reserveIn: BigNumber, reserveOut: BigNumber, amountOut: BigNumber): BigNumber | null {
    if (amountOut.lte(0) || reserveIn.lte(0) || reserveOut.lte(0)) {
      return null;
    }

    try {
      const tokenIn = new Token(
        ChainId.MAINNET,
        '0x0000000000000000000000000000000000000001',
        18,
        '1',
      );
      const tokenOut = new Token(
        ChainId.MAINNET,
        '0x0000000000000000000000000000000000000002',
        18,
        '2',
      );

      const pair = new Pair(
        new TokenAmount(tokenIn, reserveIn.toString()),
        new TokenAmount(tokenOut, reserveOut.toString()),
      );

      const route = new Route([pair], tokenIn, tokenOut);
      const trade = new Trade(
        route,
        new TokenAmount(tokenOut, amountOut.toString()),
        TradeType.EXACT_OUTPUT,
      );
      return BigNumber.from(trade.inputAmount.raw.toString());
    } catch (e) {
      //console.error(e);
      return null;
    }
  },

  getTokensOut(reserveIn: BigNumber, reserveOut: BigNumber, amountIn: BigNumber): BigNumber | null {
    if (amountIn.lte(0) || reserveIn.lte(0) || reserveOut.lte(0)) {
      return null;
    }

    try {
      const tokenIn = new Token(
        ChainId.MAINNET,
        '0x0000000000000000000000000000000000000001',
        18,
        '1',
      );
      const tokenOut = new Token(
        ChainId.MAINNET,
        '0x0000000000000000000000000000000000000002',
        18,
        '2',
      );

      const pair = new Pair(
        new TokenAmount(tokenIn, reserveIn.toString()),
        new TokenAmount(tokenOut, reserveOut.toString()),
      );

      const route = new Route([pair], tokenIn, tokenOut);
      const trade = new Trade(
        route,
        new TokenAmount(tokenIn, amountIn.toString()),
        TradeType.EXACT_INPUT,
      );
      return BigNumber.from(trade.outputAmount.raw.toString());
    } catch (e) {
      //console.error(e);
      return null;
    }
  },
};

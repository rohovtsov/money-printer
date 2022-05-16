import { Token, CurrencyAmount, BigintIsh } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import invariant from 'tiny-invariant';
import {
  FeeAmount,
  LiquidityMath,
  Pool,
  SwapMath,
  Tick,
  TICK_SPACINGS,
  TickConstructorArgs,
  TickList,
  TickListDataProvider,
  TickMath,
} from '@uniswap/v3-sdk';

// constants used internally but not expected to be used externally
const NEGATIVE_ONE = JSBI.BigInt(-1);
const ZERO = JSBI.BigInt(0);
const ONE = JSBI.BigInt(1);

// used in liquidity amount math
const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
const Q192 = JSBI.exponentiate(Q96, JSBI.BigInt(2));

interface StepComputations {
  sqrtPriceStartX96: JSBI;
  tickNext: number;
  initialized: boolean;
  sqrtPriceNextX96: JSBI;
  amountIn: JSBI;
  amountOut: JSBI;
  feeAmount: JSBI;
}

/**
 * A data provider for ticks that is backed by an in-memory array of ticks.
 */
class AdvancedTickListDataProvider extends TickListDataProvider {
  private advancedTicks: readonly Tick[];

  constructor(ticks: (Tick | TickConstructorArgs)[], tickSpacing: number) {
    super(ticks, tickSpacing);
    const ticksMapped: Tick[] = ticks.map((t) => (t instanceof Tick ? t : new Tick(t)));
    TickList.validateList(ticksMapped, tickSpacing);
    this.advancedTicks = ticksMapped;
  }

  getTickSync(tick: number): { liquidityNet: BigintIsh; liquidityGross: BigintIsh } {
    return TickList.getTick(this.advancedTicks, tick);
  }

  nextInitializedTickWithinOneWordSync(
    tick: number,
    lte: boolean,
    tickSpacing: number,
  ): [number, boolean] {
    return TickList.nextInitializedTickWithinOneWord(this.advancedTicks, tick, lte, tickSpacing);
  }
}

export class AdvancedPool extends Pool {
  protected advancedTickDataProvider: AdvancedTickListDataProvider;
  public advancedTicks: Tick[];

  public constructor(
    tokenA: Token,
    tokenB: Token,
    fee: FeeAmount,
    sqrtRatioX96: BigintIsh,
    liquidity: BigintIsh,
    tickCurrent: number,
    ticks: Tick[],
  ) {
    super(
      tokenA,
      tokenB,
      fee,
      sqrtRatioX96,
      liquidity,
      tickCurrent,
      new AdvancedTickListDataProvider(ticks, TICK_SPACINGS[fee]),
    );
    this.advancedTicks = ticks;
    this.advancedTickDataProvider = this.tickDataProvider as AdvancedTickListDataProvider;
  }

  /**
   * Given an input amount of a token, return the computed output amount, and a pool with state updated after the trade
   * @param inputAmount The input amount for which to quote the output amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit
   * @returns The output amount and the pool with updated state
   */
  public getOutputAmountSync(
    inputAmount: CurrencyAmount<Token>,
    sqrtPriceLimitX96?: JSBI,
  ): [CurrencyAmount<Token>, Pool] {
    invariant(this.involvesToken(inputAmount.currency), 'TOKEN');

    const zeroForOne = inputAmount.currency.equals(this.token0);

    const {
      amountCalculated: outputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent,
    } = this.swapSync(zeroForOne, inputAmount.quotient, sqrtPriceLimitX96);
    const outputToken = zeroForOne ? this.token1 : this.token0;
    return [
      CurrencyAmount.fromRawAmount(outputToken, JSBI.multiply(outputAmount, NEGATIVE_ONE)),
      new Pool(
        this.token0,
        this.token1,
        this.fee,
        sqrtRatioX96,
        liquidity,
        tickCurrent,
        this.tickDataProvider,
      ),
    ];
  }

  /**
   * Given a desired output amount of a token, return the computed input amount and a pool with state updated after the trade
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  public getInputAmountSync(
    outputAmount: CurrencyAmount<Token>,
    sqrtPriceLimitX96?: JSBI,
  ): [CurrencyAmount<Token>, Pool] {
    invariant(outputAmount.currency.isToken && this.involvesToken(outputAmount.currency), 'TOKEN');

    const zeroForOne = outputAmount.currency.equals(this.token1);

    const {
      amountCalculated: inputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent,
    } = this.swapSync(
      zeroForOne,
      JSBI.multiply(outputAmount.quotient, NEGATIVE_ONE),
      sqrtPriceLimitX96,
    );
    const inputToken = zeroForOne ? this.token0 : this.token1;
    return [
      CurrencyAmount.fromRawAmount(inputToken, inputAmount),
      new Pool(
        this.token0,
        this.token1,
        this.fee,
        sqrtRatioX96,
        liquidity,
        tickCurrent,
        this.tickDataProvider,
      ),
    ];
  }

  /**
   * Executes a swap
   * @param zeroForOne Whether the amount in is token0 or token1
   * @param amountSpecified The amount of the swap, which implicitly configures the swap as exact input (positive), or exact output (negative)
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns amountCalculated
   * @returns sqrtRatioX96
   * @returns liquidity
   * @returns tickCurrent
   */
  private swapSync(
    zeroForOne: boolean,
    amountSpecified: JSBI,
    sqrtPriceLimitX96?: JSBI,
  ): { amountCalculated: JSBI; sqrtRatioX96: JSBI; liquidity: JSBI; tickCurrent: number } {
    invariant(JSBI.notEqual(amountSpecified, ZERO), 'ZERO_AMOUNT_SPECIFIED');

    if (!sqrtPriceLimitX96)
      sqrtPriceLimitX96 = zeroForOne
        ? JSBI.add(TickMath.MIN_SQRT_RATIO, ONE)
        : JSBI.subtract(TickMath.MAX_SQRT_RATIO, ONE);

    if (zeroForOne) {
      invariant(JSBI.greaterThan(sqrtPriceLimitX96, TickMath.MIN_SQRT_RATIO), 'RATIO_MIN');
      invariant(JSBI.lessThan(sqrtPriceLimitX96, this.sqrtRatioX96), 'RATIO_CURRENT');
    } else {
      invariant(JSBI.lessThan(sqrtPriceLimitX96, TickMath.MAX_SQRT_RATIO), 'RATIO_MAX');
      invariant(JSBI.greaterThan(sqrtPriceLimitX96, this.sqrtRatioX96), 'RATIO_CURRENT');
    }

    const exactInput = JSBI.greaterThanOrEqual(amountSpecified, ZERO);

    // keep track of swap state

    const state = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: ZERO,
      sqrtPriceX96: this.sqrtRatioX96,
      tick: this.tickCurrent,
      liquidity: this.liquidity,
    };

    // start swap while loop
    while (
      JSBI.notEqual(state.amountSpecifiedRemaining, ZERO) &&
      state.sqrtPriceX96 != sqrtPriceLimitX96
    ) {
      let step: Partial<StepComputations> = {};
      step.sqrtPriceStartX96 = state.sqrtPriceX96;

      // because each iteration of the while loop rounds, we can't optimize this code (relative to the smart contract)
      // by simply traversing to the next available tick, we instead need to exactly replicate
      // tickBitmap.nextInitializedTickWithinOneWord
      [step.tickNext, step.initialized] =
        this.advancedTickDataProvider.nextInitializedTickWithinOneWordSync(
          state.tick,
          zeroForOne,
          this.tickSpacing,
        );

      if (step.tickNext < TickMath.MIN_TICK) {
        step.tickNext = TickMath.MIN_TICK;
      } else if (step.tickNext > TickMath.MAX_TICK) {
        step.tickNext = TickMath.MAX_TICK;
      }

      step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);
      [state.sqrtPriceX96, step.amountIn, step.amountOut, step.feeAmount] =
        SwapMath.computeSwapStep(
          state.sqrtPriceX96,
          (
            zeroForOne
              ? JSBI.lessThan(step.sqrtPriceNextX96, sqrtPriceLimitX96)
              : JSBI.greaterThan(step.sqrtPriceNextX96, sqrtPriceLimitX96)
          )
            ? sqrtPriceLimitX96
            : step.sqrtPriceNextX96,
          state.liquidity,
          state.amountSpecifiedRemaining,
          this.fee,
        );

      if (exactInput) {
        state.amountSpecifiedRemaining = JSBI.subtract(
          state.amountSpecifiedRemaining,
          JSBI.add(step.amountIn, step.feeAmount),
        );
        state.amountCalculated = JSBI.subtract(state.amountCalculated, step.amountOut);
      } else {
        state.amountSpecifiedRemaining = JSBI.add(state.amountSpecifiedRemaining, step.amountOut);
        state.amountCalculated = JSBI.add(
          state.amountCalculated,
          JSBI.add(step.amountIn, step.feeAmount),
        );
      }

      // TODO
      if (JSBI.equal(state.sqrtPriceX96, step.sqrtPriceNextX96)) {
        // if the tick is initialized, run the tick transition
        if (step.initialized) {
          let liquidityNet = JSBI.BigInt(
            this.advancedTickDataProvider.getTickSync(step.tickNext).liquidityNet,
          );
          // if we're moving leftward, we interpret liquidityNet as the opposite sign
          // safe because liquidityNet cannot be type(int128).min
          if (zeroForOne) liquidityNet = JSBI.multiply(liquidityNet, NEGATIVE_ONE);

          state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
          invariant(exactInput || JSBI.notEqual(state.liquidity, ZERO), 'LIQUIDITY_ZERO');
        }

        state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
      } else if (state.sqrtPriceX96 != step.sqrtPriceStartX96) {
        // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
        state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
      }
    }

    return {
      amountCalculated: state.amountCalculated,
      sqrtRatioX96: state.sqrtPriceX96,
      liquidity: state.liquidity,
      tickCurrent: state.tick,
    };
  }
}

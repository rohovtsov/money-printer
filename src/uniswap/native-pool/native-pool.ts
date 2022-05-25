import {
  clamp,
  FeeAmount,
  LiquidityMath,
  SwapMath,
  NativeTick,
  TICK_SPACINGS,
  NativeTickDataProvider,
  TickMath,
  MAX_FEE,
  SqrtPriceMath,
  FullMath,
} from './native-pool-utils';
import invariant from 'tiny-invariant';

interface StepComputations {
  sqrtPriceStartX96: bigint;
  tickNext: number;
  tickNextInitialized: NativeTick | null;
  sqrtPriceNextX96: bigint;
  amountIn: bigint;
  amountOut: bigint;
  feeAmount: bigint;
}

export interface NativeSwapStep {
  amountIn: bigint;
  amountOut: bigint;
  liquidity: bigint;
  sqrtPrice: bigint;
}

/**
 * Represents a V3 pool
 */
export class NativePool {
  public readonly tickDataProvider: NativeTickDataProvider;
  public readonly tickSpacing: number;
  public readonly feeBigInt: bigint;

  public constructor(
    public readonly token0: string,
    public readonly token1: string,
    public readonly fee: FeeAmount,
    public readonly sqrtRatioX96: bigint,
    public readonly liquidity: bigint,
    public readonly tickCurrent: number,
    public readonly ticks: NativeTick[],
  ) {
    invariant(Number.isInteger(fee) && fee < 1_000_000, 'FEE');

    const tickCurrentSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent);
    const nextTickSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent + 1);
    invariant(
      sqrtRatioX96 >= tickCurrentSqrtRatioX96 && sqrtRatioX96 <= nextTickSqrtRatioX96,
      'PRICE_BOUNDS',
    );
    // always create a copy of the list since we want the pool's tick list to be immutable
    // TODO: RECHECK
    // [this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
    this.tickSpacing = TICK_SPACINGS[this.fee];
    this.tickDataProvider = new NativeTickDataProvider(ticks, this.tickSpacing);
    this.feeBigInt = BigInt(this.fee);
  }

  /**
   * Returns true if the token is either token0 or token1
   * @param token The token to check
   * @returns True if token is either token0 or token
   */
  public involvesToken(token: string): boolean {
    return token === this.token0 || token === this.token1;
  }

  /**
   * Given an input amount of a token, return the computed output amount, and a pool with state updated after the trade
   * @param inputAmount The input amount for which to quote the output amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit
   * @returns The output amount and the pool with updated state
   */
  public getOutputAmount(
    inputToken: string,
    inputAmount: bigint,
    sqrtPriceLimitX96?: bigint,
  ): bigint {
    invariant(this.involvesToken(inputToken), 'TOKEN');

    const zeroForOne = inputToken === this.token0;

    const outputAmount = this.swapFast(zeroForOne, inputAmount);

    return outputAmount * -1n;
  }

  /**
   * Given a desired output amount of a token, return the computed input amount and a pool with state updated after the trade
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  public getInputAmount(
    outputToken: string,
    outputAmount: bigint,
    sqrtPriceLimitX96?: bigint,
  ): bigint {
    invariant(this.involvesToken(outputToken), 'TOKEN');

    const zeroForOne = outputToken === this.token1;

    const inputAmount = this.swapFast(zeroForOne, outputAmount * -1n);

    return inputAmount;
  }

  private swap(
    zeroForOne: boolean,
    amountSpecified: bigint,
    sqrtPriceLimitX96?: bigint,
  ): { amountCalculated: bigint; sqrtRatioX96: bigint; liquidity: bigint; tickCurrent: number } {
    invariant(amountSpecified !== 0n, 'ZERO_AMOUNT_SPECIFIED');

    if (sqrtPriceLimitX96 === undefined || sqrtPriceLimitX96 === null) {
      sqrtPriceLimitX96 = zeroForOne ? TickMath.MIN_SQRT_RATIO + 1n : TickMath.MAX_SQRT_RATIO - 1n;
    }

    if (zeroForOne) {
      invariant(sqrtPriceLimitX96 > TickMath.MIN_SQRT_RATIO, 'RATIO_MIN');
      invariant(sqrtPriceLimitX96 < this.sqrtRatioX96, 'RATIO_CURRENT');
    } else {
      invariant(sqrtPriceLimitX96 < TickMath.MAX_SQRT_RATIO, 'RATIO_MAX');
      invariant(sqrtPriceLimitX96 > this.sqrtRatioX96, 'RATIO_CURRENT');
    }

    const exactInput = amountSpecified >= 0n;

    // keep track of swap state

    const state = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: 0n,
      sqrtPriceX96: this.sqrtRatioX96,
      tick: this.tickCurrent,
      liquidity: this.liquidity,
    };

    // start swap while loop
    while (state.amountSpecifiedRemaining !== 0n && state.sqrtPriceX96 !== sqrtPriceLimitX96) {
      let step: Partial<StepComputations> = {};
      step.sqrtPriceStartX96 = state.sqrtPriceX96;

      // because each iteration of the while loop rounds, we can't optimize this code (relative to the smart contract)
      // by simply traversing to the next available tick, we instead need to exactly replicate
      // tickBitmap.nextInitializedTickWithinOneWord
      [step.tickNext, step.tickNextInitialized] =
        this.tickDataProvider.nextInitializedTickWithinOneWord(
          state.tick,
          zeroForOne,
          this.tickSpacing,
        );

      step.tickNext = clamp(step.tickNext, TickMath.MIN_TICK, TickMath.MAX_TICK);
      step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);

      [state.sqrtPriceX96, step.amountIn, step.amountOut, step.feeAmount] =
        SwapMath.computeSwapStep(
          state.sqrtPriceX96,
          (
            zeroForOne
              ? step.sqrtPriceNextX96 < sqrtPriceLimitX96
              : step.sqrtPriceNextX96 > sqrtPriceLimitX96
          )
            ? sqrtPriceLimitX96
            : step.sqrtPriceNextX96,
          state.liquidity,
          state.amountSpecifiedRemaining,
          this.fee,
        );
      /*console.log(
        `Pool result : ${state.sqrtPriceX96} ${step.amountIn} ${step.amountOut} ${zeroForOne}`,
      );*/

      if (exactInput) {
        state.amountSpecifiedRemaining -= step.amountIn + step.feeAmount;
        state.amountCalculated -= step.amountOut;
      } else {
        state.amountSpecifiedRemaining += step.amountOut;
        state.amountCalculated += step.amountIn + step.feeAmount;
      }

      // TODO
      if (state.sqrtPriceX96 === step.sqrtPriceNextX96) {
        // if the tick is initialized, run the tick transition
        if (step.tickNextInitialized) {
          let liquidityNet = step.tickNextInitialized.liquidityNet;
          // if we're moving leftward, we interpret liquidityNet as the opposite sign
          // safe because liquidityNet cannot be type(int128).min
          if (zeroForOne) {
            liquidityNet *= -1n;
          }

          state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
          invariant(exactInput || state.liquidity !== 0n, 'LIQUIDITY_ZERO');
        }

        state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
      } else if (state.sqrtPriceX96 !== step.sqrtPriceStartX96) {
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

  private swapFast(zeroForOne: boolean, amountSpecified: bigint): bigint {
    invariant(amountSpecified !== 0n, 'ZERO_AMOUNT_SPECIFIED');
    const sqrtPriceLimitX96 = zeroForOne
      ? TickMath.MIN_SQRT_RATIO + 1n
      : TickMath.MAX_SQRT_RATIO - 1n;

    if (zeroForOne) {
      invariant(sqrtPriceLimitX96 < this.sqrtRatioX96, 'RATIO_CURRENT');
    } else {
      invariant(sqrtPriceLimitX96 > this.sqrtRatioX96, 'RATIO_CURRENT');
    }

    const exactInput = amountSpecified >= 0n;
    let stateAmountSpecifiedRemaining = amountSpecified;
    let stateAmountCalculated = 0n;
    let stateSqrtPriceX96 = this.sqrtRatioX96;
    let stateTick = this.tickCurrent;
    let stateLiquidity = this.liquidity;

    // start swap while loop
    while (stateAmountSpecifiedRemaining !== 0n && stateSqrtPriceX96 !== sqrtPriceLimitX96) {
      let stepSqrtPriceStartX96: bigint;
      let stepTickNext: number;
      let stepTickNextInitialized: NativeTick | null;
      let stepSqrtPriceNextX96: bigint;
      let stepAmountIn: bigint;
      let stepAmountOut: bigint;
      let stepFeeAmount: bigint;
      stepSqrtPriceStartX96 = stateSqrtPriceX96;

      // because each iteration of the while loop rounds, we can't optimize this code (relative to the smart contract)
      // by simply traversing to the next available tick, we instead need to exactly replicate
      // tickBitmap.nextInitializedTickWithinOneWord
      [stepTickNext, stepTickNextInitialized] =
        this.tickDataProvider.nextInitializedTickWithinOneWord(
          stateTick,
          zeroForOne,
          this.tickSpacing,
        );

      stepTickNext = clamp(stepTickNext, TickMath.MIN_TICK, TickMath.MAX_TICK);
      stepSqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(stepTickNext);

      //BEGIN of SwapMath.computeSwapStep
      const swapStepSqrtPriceNextX96 = (
        zeroForOne
          ? stepSqrtPriceNextX96 < sqrtPriceLimitX96
          : stepSqrtPriceNextX96 > sqrtPriceLimitX96
      )
        ? sqrtPriceLimitX96
        : stepSqrtPriceNextX96;
      const swapStepSqrtPriceX96 = stateSqrtPriceX96;
      const swapStepLiquidity = stateLiquidity;
      const swapStepAmountSpecifiedRemaining = stateAmountSpecifiedRemaining;

      if (exactInput) {
        const amountRemainingLessFee =
          (swapStepAmountSpecifiedRemaining * (MAX_FEE - this.feeBigInt)) / MAX_FEE;
        stepAmountIn = zeroForOne
          ? SqrtPriceMath.getAmount0Delta(
              swapStepSqrtPriceNextX96,
              swapStepSqrtPriceX96,
              swapStepLiquidity,
              true,
            )
          : SqrtPriceMath.getAmount1Delta(
              swapStepSqrtPriceX96,
              swapStepSqrtPriceNextX96,
              swapStepLiquidity,
              true,
            );
        if (amountRemainingLessFee >= stepAmountIn!) {
          stateSqrtPriceX96 = swapStepSqrtPriceNextX96;
        } else {
          stateSqrtPriceX96 = SqrtPriceMath.getNextSqrtPriceFromInput(
            swapStepSqrtPriceX96,
            swapStepLiquidity,
            amountRemainingLessFee,
            zeroForOne,
          );
        }
      } else {
        stepAmountOut = zeroForOne
          ? SqrtPriceMath.getAmount1Delta(
              swapStepSqrtPriceNextX96,
              swapStepSqrtPriceX96,
              swapStepLiquidity,
              false,
            )
          : SqrtPriceMath.getAmount0Delta(
              swapStepSqrtPriceX96,
              swapStepSqrtPriceNextX96,
              swapStepLiquidity,
              false,
            );
        if (swapStepAmountSpecifiedRemaining * -1n >= stepAmountOut) {
          stateSqrtPriceX96 = swapStepSqrtPriceNextX96;
        } else {
          stateSqrtPriceX96 = SqrtPriceMath.getNextSqrtPriceFromOutput(
            swapStepSqrtPriceX96,
            swapStepLiquidity,
            swapStepAmountSpecifiedRemaining * -1n,
            zeroForOne,
          );
        }
      }

      const max = swapStepSqrtPriceNextX96 === stateSqrtPriceX96;

      if (zeroForOne) {
        stepAmountIn =
          max && exactInput
            ? stepAmountIn!
            : SqrtPriceMath.getAmount0Delta(
                stateSqrtPriceX96,
                swapStepSqrtPriceX96,
                swapStepLiquidity,
                true,
              );
        stepAmountOut =
          max && !exactInput
            ? stepAmountOut!
            : SqrtPriceMath.getAmount1Delta(
                stateSqrtPriceX96,
                swapStepSqrtPriceX96,
                swapStepLiquidity,
                false,
              );
      } else {
        stepAmountIn =
          max && exactInput
            ? stepAmountIn!
            : SqrtPriceMath.getAmount1Delta(
                swapStepSqrtPriceX96,
                stateSqrtPriceX96,
                swapStepLiquidity,
                true,
              );
        stepAmountOut =
          max && !exactInput
            ? stepAmountOut!
            : SqrtPriceMath.getAmount0Delta(
                swapStepSqrtPriceX96,
                stateSqrtPriceX96,
                swapStepLiquidity,
                false,
              );
      }

      if (!exactInput && stepAmountOut! > swapStepAmountSpecifiedRemaining * -1n) {
        stepAmountOut = swapStepAmountSpecifiedRemaining * -1n;
      }

      if (exactInput && stateSqrtPriceX96 !== swapStepSqrtPriceNextX96) {
        // we didn't reach the target, so take the remainder of the maximum input as fee
        stepFeeAmount = swapStepAmountSpecifiedRemaining - stepAmountIn!;
      } else {
        stepFeeAmount = FullMath.mulDivRoundingUp(
          stepAmountIn!,
          this.feeBigInt,
          MAX_FEE - this.feeBigInt,
        );
      }
      //END of SwapMath.computeSwapStep

      if (exactInput) {
        stateAmountSpecifiedRemaining -= stepAmountIn! + stepFeeAmount;
        stateAmountCalculated -= stepAmountOut!;
      } else {
        stateAmountSpecifiedRemaining += stepAmountOut!;
        stateAmountCalculated += stepAmountIn! + stepFeeAmount;
      }

      // TODO
      if (stateSqrtPriceX96 === stepSqrtPriceNextX96) {
        // if the tick is initialized, run the tick transition
        if (stepTickNextInitialized) {
          let liquidityNet = stepTickNextInitialized.liquidityNet;
          // if we're moving leftward, we interpret liquidityNet as the opposite sign
          // safe because liquidityNet cannot be type(int128).min
          if (zeroForOne) {
            liquidityNet *= -1n;
          }

          stateLiquidity = LiquidityMath.addDelta(stateLiquidity, liquidityNet);
          invariant(exactInput || stateLiquidity !== 0n, 'LIQUIDITY_ZERO');
        }

        stateTick = zeroForOne ? stepTickNext - 1 : stepTickNext;
      } else if (stateSqrtPriceX96 !== stepSqrtPriceStartX96) {
        // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
        stateTick = TickMath.getTickAtSqrtRatio(stateSqrtPriceX96);
      }
    }

    return stateAmountCalculated;
  }

  public swapSteps(zeroForOne: boolean): NativeSwapStep[] {
    //TODO: change to while tick <= MAX_TICK / MIN_TICK
    const amountSpecified = 1000000000000000000000000000000000000000000000000000000n;
    const sqrtPriceLimitX96 = zeroForOne
      ? TickMath.MIN_SQRT_RATIO + 1n
      : TickMath.MAX_SQRT_RATIO - 1n;
    const steps: NativeSwapStep[] = [];

    if (zeroForOne) {
      invariant(sqrtPriceLimitX96 > TickMath.MIN_SQRT_RATIO, 'RATIO_MIN');
      invariant(sqrtPriceLimitX96 < this.sqrtRatioX96, 'RATIO_CURRENT');
    } else {
      invariant(sqrtPriceLimitX96 < TickMath.MAX_SQRT_RATIO, 'RATIO_MAX');
      invariant(sqrtPriceLimitX96 > this.sqrtRatioX96, 'RATIO_CURRENT');
    }

    const exactInput = amountSpecified >= 0n;

    // keep track of swap state

    const state = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: 0n,
      sqrtPriceX96: this.sqrtRatioX96,
      tick: this.tickCurrent,
      liquidity: this.liquidity,
    };

    // start swap while loop
    while (state.amountSpecifiedRemaining !== 0n && state.sqrtPriceX96 !== sqrtPriceLimitX96) {
      let step: Partial<StepComputations> = {};
      step.sqrtPriceStartX96 = state.sqrtPriceX96;

      // because each iteration of the while loop rounds, we can't optimize this code (relative to the smart contract)
      // by simply traversing to the next available tick, we instead need to exactly replicate
      // tickBitmap.nextInitializedTickWithinOneWord
      [step.tickNext, step.tickNextInitialized] =
        this.tickDataProvider.nextInitializedTickWithinOneWord(
          state.tick,
          zeroForOne,
          this.tickSpacing,
        );

      step.tickNext = clamp(step.tickNext, TickMath.MIN_TICK, TickMath.MAX_TICK);
      step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);

      const stepSqrtPriceX96 = state.sqrtPriceX96;
      const stepLiquidity = state.liquidity;
      const stepTargetSqrtPriceX96 = (
        zeroForOne
          ? step.sqrtPriceNextX96 < sqrtPriceLimitX96
          : step.sqrtPriceNextX96 > sqrtPriceLimitX96
      )
        ? sqrtPriceLimitX96
        : step.sqrtPriceNextX96;

      [state.sqrtPriceX96, step.amountIn, step.amountOut, step.feeAmount] =
        SwapMath.computeSwapStep(
          stepSqrtPriceX96,
          stepTargetSqrtPriceX96,
          stepLiquidity,
          state.amountSpecifiedRemaining,
          this.fee,
        );

      if (exactInput) {
        state.amountSpecifiedRemaining -= step.amountIn + step.feeAmount;
        state.amountCalculated -= step.amountOut;
      } else {
        state.amountSpecifiedRemaining += step.amountOut;
        state.amountCalculated += step.amountIn + step.feeAmount;
      }

      // TODO
      if (state.sqrtPriceX96 === step.sqrtPriceNextX96) {
        // if the tick is initialized, run the tick transition
        if (step.tickNextInitialized) {
          let liquidityNet = step.tickNextInitialized.liquidityNet;
          // if we're moving leftward, we interpret liquidityNet as the opposite sign
          // safe because liquidityNet cannot be type(int128).min
          if (zeroForOne) {
            liquidityNet *= -1n;
          }

          state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
          invariant(exactInput || state.liquidity !== 0n, 'LIQUIDITY_ZERO');
        }

        state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
      } else if (state.sqrtPriceX96 !== step.sqrtPriceStartX96) {
        // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
        state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
      }

      steps.push({
        amountIn: step.amountIn + step.feeAmount,
        amountOut: step.amountOut,
        liquidity: stepLiquidity,
        sqrtPrice: stepSqrtPriceX96,
      });
    }

    return steps;
  }
}

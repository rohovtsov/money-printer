import invariant from 'tiny-invariant';
import JSBI from 'jsbi';

function currentTimeMicroSec(): number {
  const hrTime = process.hrtime() as any[];
  return hrTime[0] * 1000000 + parseInt(String(hrTime[1] / 1000));
}
let totalMicroSec = 0;

/**
 * The default factory enabled fee amounts, denominated in hundredths of bips.
 */
export enum FeeAmount {
  LOWEST = 100,
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

/**
 * The default factory tick spacings by fee amount.
 */
export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
  [FeeAmount.LOWEST]: 1,
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
};

const MaxUint160 = BigInt(
  JSBI.subtract(JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(160)), JSBI.BigInt(1)).toString(),
);
const MaxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
const POWERS_OF_2 = [128, 64, 32, 16, 8, 4, 2, 1].map((pow: number): [number, bigint] => [
  pow,
  BigInt(JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(pow)).toString()),
]);
const Q32 = BigInt(JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(32)).toString());
const Q96 = BigInt(JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96)).toString());
export const MAX_FEE = BigInt(JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(6)).toString());

export function mostSignificantBit(x: bigint): number {
  invariant(x > 0n, 'ZERO');
  invariant(x <= MaxUint256, 'MAX');

  let msb: number = 0;
  for (const [power, min] of POWERS_OF_2) {
    if (x >= min) {
      x = x >> BigInt(power);
      msb += power;
    }
  }
  return msb;
}

function mulShift(val: bigint, mulBy: string): bigint {
  return (val * BigInt(mulBy)) >> BigInt(128);
}

export abstract class TickMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  /**
   * The minimum tick that can be used on any pool.
   */
  public static MIN_TICK: number = -887272;

  /**
   * The maximum tick that can be used on any pool.
   */
  public static MAX_TICK: number = -TickMath.MIN_TICK;

  /**
   * The sqrt ratio corresponding to the minimum tick that could be used on any pool.
   */
  public static MIN_SQRT_RATIO: bigint = BigInt('4295128739');

  /**
   * The sqrt ratio corresponding to the maximum tick that could be used on any pool.
   */
  public static MAX_SQRT_RATIO: bigint = BigInt(
    '1461446703485210103287273052203988822378723970342',
  );

  private static cache_getSqrtRatioAtTick: Record<number, bigint> = [];

  /**
   * Returns the sqrt ratio as a Q64.96 for the given tick. The sqrt ratio is computed as sqrt(1.0001)^tick
   * @param tick the tick for which to compute the sqrt ratio
   */
  public static getSqrtRatioAtTick(tick: number): bigint {
    if (TickMath.cache_getSqrtRatioAtTick[tick] !== undefined) {
      return TickMath.cache_getSqrtRatioAtTick[tick];
    }

    invariant(
      tick >= TickMath.MIN_TICK && tick <= TickMath.MAX_TICK && Number.isInteger(tick),
      'TICK',
    );
    const absTick: number = tick < 0 ? tick * -1 : tick;

    let ratio: bigint =
      (absTick & 0x1) != 0
        ? BigInt('0xfffcb933bd6fad37aa2d162d1a594001')
        : BigInt('0x100000000000000000000000000000000');
    if ((absTick & 0x2) != 0) ratio = mulShift(ratio, '0xfff97272373d413259a46990580e213a');
    if ((absTick & 0x4) != 0) ratio = mulShift(ratio, '0xfff2e50f5f656932ef12357cf3c7fdcc');
    if ((absTick & 0x8) != 0) ratio = mulShift(ratio, '0xffe5caca7e10e4e61c3624eaa0941cd0');
    if ((absTick & 0x10) != 0) ratio = mulShift(ratio, '0xffcb9843d60f6159c9db58835c926644');
    if ((absTick & 0x20) != 0) ratio = mulShift(ratio, '0xff973b41fa98c081472e6896dfb254c0');
    if ((absTick & 0x40) != 0) ratio = mulShift(ratio, '0xff2ea16466c96a3843ec78b326b52861');
    if ((absTick & 0x80) != 0) ratio = mulShift(ratio, '0xfe5dee046a99a2a811c461f1969c3053');
    if ((absTick & 0x100) != 0) ratio = mulShift(ratio, '0xfcbe86c7900a88aedcffc83b479aa3a4');
    if ((absTick & 0x200) != 0) ratio = mulShift(ratio, '0xf987a7253ac413176f2b074cf7815e54');
    if ((absTick & 0x400) != 0) ratio = mulShift(ratio, '0xf3392b0822b70005940c7a398e4b70f3');
    if ((absTick & 0x800) != 0) ratio = mulShift(ratio, '0xe7159475a2c29b7443b29c7fa6e889d9');
    if ((absTick & 0x1000) != 0) ratio = mulShift(ratio, '0xd097f3bdfd2022b8845ad8f792aa5825');
    if ((absTick & 0x2000) != 0) ratio = mulShift(ratio, '0xa9f746462d870fdf8a65dc1f90e061e5');
    if ((absTick & 0x4000) != 0) ratio = mulShift(ratio, '0x70d869a156d2a1b890bb3df62baf32f7');
    if ((absTick & 0x8000) != 0) ratio = mulShift(ratio, '0x31be135f97d08fd981231505542fcfa6');
    if ((absTick & 0x10000) != 0) ratio = mulShift(ratio, '0x9aa508b5b7a84e1c677de54f3e99bc9');
    if ((absTick & 0x20000) != 0) ratio = mulShift(ratio, '0x5d6af8dedb81196699c329225ee604');
    if ((absTick & 0x40000) != 0) ratio = mulShift(ratio, '0x2216e584f5fa1ea926041bedfe98');
    if ((absTick & 0x80000) != 0) ratio = mulShift(ratio, '0x48a170391f7dc42444e8fa2');

    if (tick > 0) ratio = MaxUint256 / ratio;

    // back to Q96
    const result = ratio % Q32 > 0n ? ratio / Q32 + 1n : ratio / Q32;
    TickMath.cache_getSqrtRatioAtTick[tick] = result;

    return result;
  }

  /**
   * Returns the tick corresponding to a given sqrt ratio, s.t. #getSqrtRatioAtTick(tick) <= sqrtRatioX96
   * and #getSqrtRatioAtTick(tick + 1) > sqrtRatioX96
   * @param sqrtRatioX96 the sqrt ratio as a Q64.96 for which to compute the tick
   */
  public static getTickAtSqrtRatio(sqrtRatioX96: bigint): number {
    invariant(
      sqrtRatioX96 >= TickMath.MIN_SQRT_RATIO && sqrtRatioX96 < TickMath.MAX_SQRT_RATIO,
      'SQRT_RATIO',
    );

    const sqrtRatioX128 = sqrtRatioX96 << 32n;
    const msb = mostSignificantBit(sqrtRatioX128);

    let r: bigint;
    if (msb >= 128) {
      r = sqrtRatioX128 >> BigInt(msb - 127);
    } else {
      r = sqrtRatioX128 << BigInt(127 - msb);
    }

    let log_2 = BigInt(msb - 128) << 64n;

    for (let i = 0; i < 14; i++) {
      r = (r * r) >> 127n;
      const f = r >> 128n;
      log_2 = log_2 | (f << BigInt(63 - i));
      r = r >> f;
    }

    const log_sqrt10001 = log_2 * BigInt('255738958999603826347141');
    const tickLow = Number(
      (log_sqrt10001 - BigInt('3402992956809132418596140100660247210')) >> 128n,
    );
    const tickHigh = Number(
      (log_sqrt10001 + BigInt('291339464771989622907027621153398088495')) >> 128n,
    );

    return tickLow === tickHigh
      ? tickLow
      : TickMath.getSqrtRatioAtTick(tickHigh) <= sqrtRatioX96
      ? tickHigh
      : tickLow;
  }
}

export abstract class LiquidityMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static addDelta(x: bigint, y: bigint): bigint {
    if (y < 0n) {
      return x - y * -1n;
    } else {
      return x + y;
    }
  }
}

export abstract class FullMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint): bigint {
    const product = a * b;
    let result = product / denominator;
    if (product % denominator !== 0n) {
      result = result + 1n;
    }
    return result;
  }
}

function multiplyIn256(x: bigint, y: bigint): bigint {
  const product = x * y;
  return product & MaxUint256;
}

function addIn256(x: bigint, y: bigint): bigint {
  const sum = x + y;
  return sum & MaxUint256;
}

export abstract class SqrtPriceMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static getAmount0Delta(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint,
    roundUp: boolean,
  ): bigint {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    const numerator1 = liquidity << 96n;
    const numerator2 = sqrtRatioBX96 - sqrtRatioAX96;

    return roundUp
      ? FullMath.mulDivRoundingUp(
          FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96),
          1n,
          sqrtRatioAX96,
        )
      : (numerator1 * numerator2) / sqrtRatioBX96 / sqrtRatioAX96;
  }

  public static getAmount1Delta(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint,
    roundUp: boolean,
  ): bigint {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    return roundUp
      ? FullMath.mulDivRoundingUp(liquidity, sqrtRatioBX96 - sqrtRatioAX96, Q96)
      : (liquidity * (sqrtRatioBX96 - sqrtRatioAX96)) / Q96;
  }

  public static getNextSqrtPriceFromInput(
    sqrtPX96: bigint,
    liquidity: bigint,
    amountIn: bigint,
    zeroForOne: boolean,
  ): bigint {
    invariant(sqrtPX96 > 0n);
    invariant(liquidity > 0n);

    return zeroForOne
      ? this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true)
      : this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
  }

  public static getNextSqrtPriceFromOutput(
    sqrtPX96: bigint,
    liquidity: bigint,
    amountOut: bigint,
    zeroForOne: boolean,
  ): bigint {
    invariant(sqrtPX96 > 0n);
    invariant(liquidity > 0n);

    return zeroForOne
      ? this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountOut, false)
      : this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountOut, false);
  }

  private static getNextSqrtPriceFromAmount0RoundingUp(
    sqrtPX96: bigint,
    liquidity: bigint,
    amount: bigint,
    add: boolean,
  ): bigint {
    if (amount === 0n) {
      return sqrtPX96;
    }
    const numerator1 = liquidity << 96n;

    if (add) {
      let product = multiplyIn256(amount, sqrtPX96);
      if (product / amount === sqrtPX96) {
        const denominator = addIn256(numerator1, product);
        if (denominator >= numerator1) {
          return FullMath.mulDivRoundingUp(numerator1, sqrtPX96, denominator);
        }
      }

      return FullMath.mulDivRoundingUp(numerator1, 1n, numerator1 / sqrtPX96 + amount);
    } else {
      let product = multiplyIn256(amount, sqrtPX96);

      invariant(product / amount === sqrtPX96);
      invariant(numerator1 > product);
      const denominator = numerator1 - product;
      return FullMath.mulDivRoundingUp(numerator1, sqrtPX96, denominator);
    }
  }

  private static getNextSqrtPriceFromAmount1RoundingDown(
    sqrtPX96: bigint,
    liquidity: bigint,
    amount: bigint,
    add: boolean,
  ): bigint {
    if (add) {
      const quotient =
        amount <= MaxUint160 ? (amount << 96n) / liquidity : (amount * Q96) / liquidity;

      return sqrtPX96 + quotient;
    } else {
      const quotient = FullMath.mulDivRoundingUp(amount, Q96, liquidity);

      invariant(sqrtPX96 > quotient);
      return sqrtPX96 - quotient;
    }
  }
}

export abstract class SwapMath {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static computeSwapStep(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feePips: FeeAmount,
  ): [bigint, bigint, bigint, bigint] {
    const returnValues: Partial<{
      sqrtRatioNextX96: bigint;
      amountIn: bigint;
      amountOut: bigint;
      feeAmount: bigint;
    }> = {};

    const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;
    const exactIn = amountRemaining >= 0n;

    if (exactIn) {
      const amountRemainingLessFee = (amountRemaining * (MAX_FEE - BigInt(feePips))) / MAX_FEE;
      returnValues.amountIn = zeroForOne
        ? SqrtPriceMath.getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true)
        : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);
      if (amountRemainingLessFee >= returnValues.amountIn!) {
        returnValues.sqrtRatioNextX96 = sqrtRatioTargetX96;
      } else {
        returnValues.sqrtRatioNextX96 = SqrtPriceMath.getNextSqrtPriceFromInput(
          sqrtRatioCurrentX96,
          liquidity,
          amountRemainingLessFee,
          zeroForOne,
        );
      }
    } else {
      returnValues.amountOut = zeroForOne
        ? SqrtPriceMath.getAmount1Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, false)
        : SqrtPriceMath.getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, false);
      if (amountRemaining * -1n >= returnValues.amountOut) {
        returnValues.sqrtRatioNextX96 = sqrtRatioTargetX96;
      } else {
        returnValues.sqrtRatioNextX96 = SqrtPriceMath.getNextSqrtPriceFromOutput(
          sqrtRatioCurrentX96,
          liquidity,
          amountRemaining * -1n,
          zeroForOne,
        );
      }
    }

    const max = sqrtRatioTargetX96 === returnValues.sqrtRatioNextX96;

    if (zeroForOne) {
      returnValues.amountIn =
        max && exactIn
          ? returnValues.amountIn
          : SqrtPriceMath.getAmount0Delta(
              returnValues.sqrtRatioNextX96,
              sqrtRatioCurrentX96,
              liquidity,
              true,
            );
      returnValues.amountOut =
        max && !exactIn
          ? returnValues.amountOut
          : SqrtPriceMath.getAmount1Delta(
              returnValues.sqrtRatioNextX96,
              sqrtRatioCurrentX96,
              liquidity,
              false,
            );
    } else {
      returnValues.amountIn =
        max && exactIn
          ? returnValues.amountIn
          : SqrtPriceMath.getAmount1Delta(
              sqrtRatioCurrentX96,
              returnValues.sqrtRatioNextX96,
              liquidity,
              true,
            );
      returnValues.amountOut =
        max && !exactIn
          ? returnValues.amountOut
          : SqrtPriceMath.getAmount0Delta(
              sqrtRatioCurrentX96,
              returnValues.sqrtRatioNextX96,
              liquidity,
              false,
            );
    }

    if (!exactIn && returnValues.amountOut! > amountRemaining * -1n) {
      returnValues.amountOut = amountRemaining * -1n;
    }

    if (exactIn && returnValues.sqrtRatioNextX96 !== sqrtRatioTargetX96) {
      // we didn't reach the target, so take the remainder of the maximum input as fee
      returnValues.feeAmount = amountRemaining - returnValues.amountIn!;
    } else {
      returnValues.feeAmount = FullMath.mulDivRoundingUp(
        returnValues.amountIn!,
        BigInt(feePips),
        MAX_FEE - BigInt(feePips),
      );
    }

    return [
      returnValues.sqrtRatioNextX96!,
      returnValues.amountIn!,
      returnValues.amountOut!,
      returnValues.feeAmount!,
    ];
  }

  public static computeSwapStepSimplified(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feePips: FeeAmount,
  ): [bigint, bigint, bigint, bigint] {
    const returnValues: Partial<{
      sqrtRatioNextX96: bigint;
      amountIn: bigint;
      amountOut: bigint;
      feeAmount: bigint;
    }> = {};

    const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;

    const amountRemainingLessFee = (amountRemaining * (MAX_FEE - BigInt(feePips))) / MAX_FEE;
    returnValues.amountIn = zeroForOne
      ? SqrtPriceMath.getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true)
      : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);
    if (amountRemainingLessFee >= returnValues.amountIn!) {
      returnValues.sqrtRatioNextX96 = sqrtRatioTargetX96;
    } else {
      returnValues.sqrtRatioNextX96 = SqrtPriceMath.getNextSqrtPriceFromInput(
        sqrtRatioCurrentX96,
        liquidity,
        amountRemainingLessFee,
        zeroForOne,
      );
    }

    const max = sqrtRatioTargetX96 === returnValues.sqrtRatioNextX96;

    if (zeroForOne) {
      returnValues.amountIn = max
        ? returnValues.amountIn
        : SqrtPriceMath.getAmount0Delta(
            returnValues.sqrtRatioNextX96,
            sqrtRatioCurrentX96,
            liquidity,
            true,
          );
      returnValues.amountOut = SqrtPriceMath.getAmount1Delta(
        returnValues.sqrtRatioNextX96,
        sqrtRatioCurrentX96,
        liquidity,
        false,
      );
    } else {
      returnValues.amountIn = max
        ? returnValues.amountIn
        : SqrtPriceMath.getAmount1Delta(
            sqrtRatioCurrentX96,
            returnValues.sqrtRatioNextX96,
            liquidity,
            true,
          );
      returnValues.amountOut = SqrtPriceMath.getAmount0Delta(
        sqrtRatioCurrentX96,
        returnValues.sqrtRatioNextX96,
        liquidity,
        false,
      );
    }

    if (returnValues.sqrtRatioNextX96 !== sqrtRatioTargetX96) {
      // we didn't reach the target, so take the remainder of the maximum input as fee
      returnValues.feeAmount = amountRemaining - returnValues.amountIn!;
    } else {
      returnValues.feeAmount = FullMath.mulDivRoundingUp(
        returnValues.amountIn!,
        BigInt(feePips),
        MAX_FEE - BigInt(feePips),
      );
    }

    return [
      returnValues.sqrtRatioNextX96!,
      returnValues.amountIn!,
      returnValues.amountOut!,
      returnValues.feeAmount!,
    ];
  }

  public static computeSwapStepSimplifiedOneForZero(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feePips: FeeAmount,
  ): [bigint, bigint, bigint, bigint] {
    const returnValues: Partial<{
      sqrtRatioNextX96: bigint;
      amountIn: bigint;
      amountOut: bigint;
      feeAmount: bigint;
    }> = {};

    const amountRemainingLessFee = (amountRemaining * (MAX_FEE - BigInt(feePips))) / MAX_FEE;
    returnValues.amountIn = SqrtPriceMath.getAmount1Delta(
      sqrtRatioCurrentX96,
      sqrtRatioTargetX96,
      liquidity,
      true,
    );
    returnValues.sqrtRatioNextX96 = this.getNextSqrtPriceFromAmount1RoundingDownSimplified(
      sqrtRatioCurrentX96,
      liquidity,
      amountRemainingLessFee,
    );

    returnValues.amountIn = SqrtPriceMath.getAmount1Delta(
      sqrtRatioCurrentX96,
      returnValues.sqrtRatioNextX96,
      liquidity,
      true,
    );
    returnValues.amountOut = SqrtPriceMath.getAmount0Delta(
      sqrtRatioCurrentX96,
      returnValues.sqrtRatioNextX96,
      liquidity,
      false,
    );

    returnValues.feeAmount = amountRemaining - returnValues.amountIn!;

    return [
      returnValues.sqrtRatioNextX96!,
      returnValues.amountIn!,
      returnValues.amountOut!,
      returnValues.feeAmount!,
    ];
  }

  public static getNextSqrtPriceFromAmount1RoundingDownSimplified(
    sqrtPX96: bigint,
    liquidity: bigint,
    amount: bigint,
  ): bigint {
    //amount <= MaxUint160!!!!
    const quotient = (amount * 2n ** 96n) / liquidity;

    return sqrtPX96 + quotient;
  }

  public static getAmount0DeltaSimplified(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint,
    roundUp: boolean,
  ): bigint {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
      console.log('SWAP');
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }
    console.log('NOSWAP');

    const numerator1 = liquidity << 96n;
    const numerator2 = sqrtRatioBX96 - sqrtRatioAX96;

    return roundUp
      ? FullMath.mulDivRoundingUp(
          FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96),
          1n,
          sqrtRatioAX96,
        )
      : (numerator1 * numerator2) / sqrtRatioBX96 / sqrtRatioAX96;
  }

  public static getAmount1DeltaSimplified(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint,
    roundUp: boolean,
  ): bigint {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    return roundUp
      ? FullMath.mulDivRoundingUp(liquidity, sqrtRatioBX96 - sqrtRatioAX96, Q96)
      : (liquidity * (sqrtRatioBX96 - sqrtRatioAX96)) / Q96;
  }

  public static computeSwapStepSuperSimplifiedOneForZero(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feePips: FeeAmount,
  ): [bigint, bigint, bigint, bigint] {
    //TODO: add invariants for max, and exactInput
    const returnValues: Partial<{
      sqrtRatioNextX96: bigint;
      amountIn: bigint;
      amountOut: bigint;
      feeAmount: bigint;
    }> = {};
    invariant(sqrtRatioCurrentX96 != sqrtRatioTargetX96);

    //const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96; = false
    const amountRemainingLessFee = (amountRemaining * (MAX_FEE - BigInt(feePips))) / MAX_FEE;
    invariant(amountRemainingLessFee <= MaxUint160);

    returnValues.sqrtRatioNextX96 =
      sqrtRatioCurrentX96 + (amountRemainingLessFee * 2n ** 96n) / liquidity;
    returnValues.amountIn = FullMath.mulDivRoundingUp(
      liquidity,
      returnValues.sqrtRatioNextX96 - sqrtRatioCurrentX96,
      Q96,
    );

    const numerator1 = liquidity * 2n ** 96n;
    const numerator2 = returnValues.sqrtRatioNextX96 - sqrtRatioCurrentX96;
    returnValues.amountOut = FullMath.mulDivRoundingUp(
      FullMath.mulDivRoundingUp(numerator1, numerator2, returnValues.sqrtRatioNextX96),
      1n,
      sqrtRatioCurrentX96,
    );

    returnValues.feeAmount = amountRemaining - returnValues.amountIn!;

    const sqA = sqrtRatioCurrentX96;
    const X = amountRemaining;
    const F = BigInt(feePips);
    const L = liquidity;
    const M = MAX_FEE;
    const sqB = sqA + (((X * (M - F)) / M) * 2n ** 96n) / L;
    const Y = (L * 2n ** 96n * (sqB - sqA)) / sqB / sqA;
    const Y2 = (L * 2n ** 96n * (sqB - sqA)) / sqB / sqA;
    console.log(Y);

    /*console.log(amountRemainingLessFee * (2n ** 96n), (X * (M - F)) / M * (2n ** 96n));
    console.log(returnValues.amountOut, Y);*/

    return [
      returnValues.sqrtRatioNextX96!,
      returnValues.amountIn!,
      returnValues.amountOut!,
      returnValues.feeAmount!,
    ];
  }
}

export function clamp(val: number, min: number, max: number): number {
  if (val < min) {
    return min;
  } else if (val > max) {
    return max;
  }

  return val;
}

/**
 * Determines if a tick list is sorted
 * @param list The tick list
 * @param comparator The comparator
 * @returns true if sorted
 */
export function isSorted<T>(list: Array<T>, comparator: (a: T, b: T) => number): boolean {
  for (let i = 0; i < list.length - 1; i++) {
    if (comparator(list[i], list[i + 1]) > 0) {
      return false;
    }
  }
  return true;
}

export class NativeTick {
  public readonly index: number;
  public readonly liquidityGross: bigint;
  public readonly liquidityNet: bigint;

  constructor(index: number, liquidityGross: bigint, liquidityNet: bigint) {
    invariant(index >= TickMath.MIN_TICK && index <= TickMath.MAX_TICK, 'TICK');
    this.index = index;
    this.liquidityGross = liquidityGross;
    this.liquidityNet = liquidityNet;
  }
}

function tickComparator(a: NativeTick, b: NativeTick) {
  return a.index - b.index;
}

/**
 * Utility methods for interacting with sorted lists of ticks
 */
export abstract class TickList {
  /**
   * Cannot be constructed
   */
  private constructor() {}

  public static validateList(ticks: NativeTick[], tickSpacing: number) {
    invariant(tickSpacing > 0, 'TICK_SPACING_NONZERO');
    // ensure ticks are spaced appropriately
    invariant(
      ticks.every(({ index }) => index % tickSpacing === 0),
      'TICK_SPACING',
    );

    // ensure tick liquidity deltas sum to 0
    invariant(
      ticks.reduce((accumulator, { liquidityNet }) => accumulator + liquidityNet, 0n) === 0n,
      'ZERO_NET',
    );

    invariant(isSorted(ticks, tickComparator), 'SORTED');
  }

  public static isBelowSmallest(ticks: readonly NativeTick[], tick: number): boolean {
    invariant(ticks.length > 0, 'LENGTH');
    return tick < ticks[0].index;
  }

  public static isAtOrAboveLargest(ticks: readonly NativeTick[], tick: number): boolean {
    invariant(ticks.length > 0, 'LENGTH');
    return tick >= ticks[ticks.length - 1].index;
  }

  public static getTick(ticks: readonly NativeTick[], index: number): NativeTick {
    const tick = ticks[this.binarySearch(ticks, index)];
    invariant(tick.index === index, 'NOT_CONTAINED');
    return tick;
  }

  /**
   * Finds the largest tick in the list of ticks that is less than or equal to tick
   * @param ticks list of ticks
   * @param tick tick to find the largest tick that is less than or equal to tick
   * @private
   */
  private static binarySearch(ticks: readonly NativeTick[], tick: number): number {
    //120 <= 125 < 180
    //-180 <= -125 < -120
    //tick = 179;
    /*let remaining = tick % tickSpacing0;
    const tryId =
      remaining === 0 ? tick :
      tick >= 0 ?
        (tick - remaining) :
        (tick - remaining - tickSpacing0);*/
    invariant(!this.isBelowSmallest(ticks, tick), 'BELOW_SMALLEST');

    let l = 0;
    let r = ticks.length - 1;
    let i;
    while (true) {
      i = Math.floor((l + r) / 2);

      if (ticks[i].index <= tick && (i === ticks.length - 1 || ticks[i + 1].index > tick)) {
        return i;
      }

      if (ticks[i].index < tick) {
        l = i + 1;
      } else {
        r = i - 1;
      }
    }
  }

  public static nextInitializedTick(
    ticks: readonly NativeTick[],
    tick: number,
    lte: boolean,
  ): NativeTick {
    if (lte) {
      invariant(!TickList.isBelowSmallest(ticks, tick), 'BELOW_SMALLEST');
      if (TickList.isAtOrAboveLargest(ticks, tick)) {
        return ticks[ticks.length - 1];
      }
      const index = this.binarySearch(ticks, tick);
      return ticks[index];
    } else {
      invariant(!this.isAtOrAboveLargest(ticks, tick), 'AT_OR_ABOVE_LARGEST');
      if (this.isBelowSmallest(ticks, tick)) {
        return ticks[0];
      }
      const index = this.binarySearch(ticks, tick);
      return ticks[index + 1];
    }
  }

  public static nextInitializedTickWithinOneWord(
    ticks: readonly NativeTick[],
    tick: number,
    lte: boolean,
    tickSpacing: number,
  ): [number, NativeTick | null] {
    const compressed = Math.floor(tick / tickSpacing); // matches rounding in the code

    if (lte) {
      const wordPos = compressed >> 8;
      const minimum = (wordPos << 8) * tickSpacing;

      if (TickList.isBelowSmallest(ticks, tick)) {
        return [minimum, null];
      }

      const tickObject = TickList.nextInitializedTick(ticks, tick, lte);
      const nextInitializedTick = Math.max(minimum, tickObject.index);
      return [nextInitializedTick, nextInitializedTick === tickObject.index ? tickObject : null];
    } else {
      const wordPos = (compressed + 1) >> 8;
      const maximum = (((wordPos + 1) << 8) - 1) * tickSpacing;

      if (this.isAtOrAboveLargest(ticks, tick)) {
        return [maximum, null];
      }

      const tickObject = this.nextInitializedTick(ticks, tick, lte);
      const nextInitializedTick = Math.min(maximum, tickObject.index);
      return [nextInitializedTick, nextInitializedTick === tickObject.index ? tickObject : null];
    }
  }
}

export class NativeTickDataProvider {
  private ticks: readonly NativeTick[];

  constructor(ticks: NativeTick[], tickSpacing: number) {
    TickList.validateList(ticks, tickSpacing);
    this.ticks = ticks;
  }

  getTick(tick: number): NativeTick {
    return TickList.getTick(this.ticks, tick);
  }

  nextInitializedTickWithinOneWord(
    tick: number,
    lte: boolean,
    tickSpacing: number,
  ): [number, NativeTick | null] {
    return TickList.nextInitializedTickWithinOneWord(this.ticks, tick, lte, tickSpacing);
  }
}

const isProduction: boolean = process.env.NODE_ENV === 'production';
const prefix: string = 'Invariant failed';

// Throw an error if the condition fails
// Strip out error messages for production
// > Not providing an inline default argument for message as the result is smaller
function invariant(
  condition: any,
  // Can provide a string, or a function that returns a string for cases where
  // the message takes a fair amount of effort to compute
  message?: string | (() => string),
): asserts condition {
  if (condition) {
    return;
  }
  // Condition not passed

  // In production we strip the message but still throw
  if (isProduction) {
    throw new Error(prefix);
  }

  // When not in production we allow the message to pass through
  // *This block will be removed in production builds*

  const provided: string | undefined = typeof message === 'function' ? message() : message;

  // Options:
  // 1. message provided: `${prefix}: ${provided}`
  // 2. message not provided: prefix
  const value: string = provided ? `${prefix}: ${provided}` : prefix;
  throw new Error(value);
}

/**
 * The default factory enabled fee amounts, denominated in hundredths of bips.
 */
enum FeeAmount {
  LOWEST = 100,
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
}

/**
 * The default factory tick spacings by fee amount.
 */
const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
  [FeeAmount.LOWEST]: 1,
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
};

const MaxUint160 = 2n ** 160n - 1n;
const MaxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
const POWERS_OF_2 = [128, 64, 32, 16, 8, 4, 2, 1].map((pow: number): [number, bigint] => [
  pow,
  2n ** BigInt(pow),
]);
const Q32 = 2n ** 32n;
const Q96 = 2n ** 96n;
const MAX_FEE = 10n ** 6n;

function mostSignificantBit(x: bigint): number {
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

abstract class TickMath {
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

abstract class LiquidityMath {
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

abstract class FullMath {
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

abstract class SqrtPriceMath {
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

abstract class SwapMath {
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
}

function clamp(val: number, min: number, max: number): number {
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
function isSorted<T>(list: Array<T>, comparator: (a: T, b: T) => number): boolean {
  for (let i = 0; i < list.length - 1; i++) {
    if (comparator(list[i], list[i + 1]) > 0) {
      return false;
    }
  }
  return true;
}

class NativeTick {
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
abstract class TickList {
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

class NativeTickDataProvider {
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

interface StepComputations {
  sqrtPriceStartX96: bigint;
  tickNext: number;
  tickNextInitialized: NativeTick | null;
  sqrtPriceNextX96: bigint;
  amountIn: bigint;
  amountOut: bigint;
  feeAmount: bigint;
}

interface NativeSwapStep {
  amountIn: bigint;
  amountOut: bigint;
  liquidity: bigint;
  sqrtPrice: bigint;
}

/**
 * Represents a V3 pool
 */
class NativePool {
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

    //invariant(outputAmount === this.swapFast(zeroForOne, inputAmount), 'FUCK');

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

    //invariant(inputAmount === this.swapFast(zeroForOne, outputAmount * -1n), 'FUCK');

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

const NATIVE_POOL = new NativePool(
  'MY_TOKEN0',
  'MY_TOKEN1',
  500,
  3516436670545488550380412n,
  983779684705963253n,
  -200463,
  [new NativeTick(-887270, 0n, 577215028887498n), new NativeTick(887270, 0n, -577215028887498n)],
);
console.log(NATIVE_POOL.getOutputAmount('MY_TOKEN0', 1000n, undefined));
console.log(NATIVE_POOL.getInputAmount('MY_TOKEN0', 1000n, undefined));

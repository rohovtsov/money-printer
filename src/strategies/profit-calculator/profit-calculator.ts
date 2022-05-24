import { UniswapV3Market } from '../../uniswap/uniswap-v3-market';
import { bigIntSqrt, EthMarket, MarketAction } from '../../entities';
import { NativeSwapStep } from '../../uniswap/native-pool/native-pool';
import { UniswapV2Market } from '../../uniswap/uniswap-v2-market';
import { MAX_FEE } from '../../uniswap/native-pool/native-pool-utils';
import { Nangle } from '../nangle';

const Q997 = 997n;
const Q1000 = 1000n;
const Q96 = 2n ** 96n;

interface MarketConstants {
  T: bigint;
  M: bigint;
  G: bigint;
}

interface NangleSwapRange {
  fromInput: bigint;
  toInput: bigint | null;
  fromOutput: bigint;
  toOutput: bigint;
  constants: MarketConstants[];
  calcInput: (output: bigint) => bigint | null;
}

interface MarketSwapRange {
  fromInput: bigint;
  toInput: bigint | null;
  fromOutput: bigint;
  toOutput: bigint;
  constants: MarketConstants;
}

function getMarketV3SwapSteps(marketV3: UniswapV3Market, action: MarketAction): NativeSwapStep[] {
  return marketV3?.pool?.swapSteps(action === 'sell') ?? [];
}

function getMarketConstants(market: EthMarket, action: MarketAction): MarketConstants {
  const isSell = action === 'sell';

  if (market.protocol === 'uniswapV3') {
    const marketV3 = market as UniswapV3Market;

    if (!marketV3.pool || marketV3.pool.liquidity <= 0n || marketV3.pool.sqrtRatioX96 <= 0n) {
      throw new Error('Wrong pool parameters');
    }

    const F = BigInt(marketV3.fee);

    let A;
    let Q;
    const L = marketV3.pool!.liquidity;

    if (isSell) {
      A = marketV3.pool!.sqrtRatioX96;
      Q = Q96;
    } else {
      A = Q96;
      Q = marketV3.pool!.sqrtRatioX96;
    }

    const T = (A * A * L * (MAX_FEE - F)) / MAX_FEE;
    const M = (A * Q * (MAX_FEE - F)) / MAX_FEE;
    const G = L * Q * Q;

    return { T, M, G };
  } else if (market.protocol === 'uniswapV2') {
    const marketV2 = market as UniswapV2Market;
    const reserves0 = marketV2.getReserve0();
    const reserves1 = marketV2.getReserve1();

    if (reserves0 <= 0n || reserves1 <= 0n) {
      throw new Error('Wrong reserves');
    }

    const reservesIn = isSell ? reserves0 : reserves1;
    const reservesOut = isSell ? reserves1 : reserves0;

    const T = Q997 * reservesOut;
    const M = Q997;
    const G = Q1000 * reservesIn;

    return { T, M, G };
  }

  throw new Error('Invalid market protocol');
}

function getMarketV2Constants(market: UniswapV2Market, action: MarketAction): MarketConstants {
  const isSell = action === 'sell';
  const reserves0 = market.getReserve0();
  const reserves1 = market.getReserve1();
  const reservesIn = isSell ? reserves0 : reserves1;
  const reservesOut = isSell ? reserves1 : reserves0;

  const T = Q997 * reservesOut;
  const M = Q997;
  const G = Q1000 * reservesIn;

  return { T, M, G };
}

function getMarketV2SwapRange(market: UniswapV2Market, action: MarketAction): MarketSwapRange {
  //Y = (T * X) / (M * X + G)

  const isSell = action === 'sell';
  const reserves0 = market.getReserve0();
  const reserves1 = market.getReserve1();
  const reservesIn = isSell ? reserves0 : reserves1;
  const reservesOut = isSell ? reserves1 : reserves0;

  const T = Q997 * reservesOut;
  const M = Q997;
  const G = Q1000 * reservesIn;

  return {
    fromInput: 0n,
    toInput: null,
    fromOutput: 0n,
    toOutput: reservesOut,
    constants: { T, M, G },
  };
}

function getMarketV3SwapRanges(market: UniswapV3Market, action: MarketAction): MarketSwapRange[] {
  //Y = (T * X) / (M * X + G)

  const isSell = action === 'sell';
  const steps = getMarketV3SwapSteps(market, action);
  let fromIn = 0n;
  let fromOut = 0n;

  const F = BigInt(market.fee);
  return steps.map((step) => {
    let A;
    let Q;
    const L = step.liquidity;

    if (isSell) {
      A = step.sqrtPrice;
      Q = Q96;
    } else {
      A = Q96;
      Q = step.sqrtPrice;
    }

    const T = (A * A * L * (MAX_FEE - F)) / MAX_FEE;
    const M = (A * Q * (MAX_FEE - F)) / MAX_FEE;
    const G = L * Q * Q;

    const range = {
      fromInput: fromIn,
      toInput: fromIn + step.amountIn,
      fromOutput: fromOut,
      toOutput: fromOut + step.amountOut,
      constants: { T, M, G },
    };

    fromIn = range.toInput;
    fromOut = range.toOutput;
    return range;
  });
}

export function getAffectedRanges(
  range: NangleSwapRange,
  inRanges: NangleSwapRange[],
): NangleSwapRange[] {
  const affected: NangleSwapRange[] = [];
  const from = range.fromInput;
  const to = range.toInput;

  for (const inRange of inRanges) {
    if (
      /*(
        //A ... B ... B ... A
        inRange.toInput !== null &&
        inRange.fromInput >= from &&
        inRange.toInput <= to
      ) || */
      //A ... B ... A ... B
      (inRange.fromOutput >= from && (to === null || inRange.fromOutput < to)) ||
      //B ... A ... B ... A
      (inRange.toOutput > from && (to === null || inRange.toOutput <= to))
    ) {
      affected.push(inRange);
    }
  }

  return affected;
}

function projectNangleSwapRange(input: NangleSwapRange, outputRanges: NangleSwapRange[]) {
  const outputs = getAffectedRanges(input, outputRanges);
  /*console.log('input');
  console.log(input);
  console.log('outputs');
  console.log(outputs);*/

  const lastOutput = outputs?.[outputs.length - 1] ?? null;
  let nextOutput: NangleSwapRange | null = null;

  if (outputs.length > 1) {
    for (let i = 0; i < outputs.length - 1; i++) {
      outputs[i].constants = [...outputs[i].constants, ...input.constants];
    }
  }

  if (lastOutput) {
    if (input.toInput === null || input.toInput >= lastOutput.toOutput) {
      lastOutput.constants = [...lastOutput.constants, ...input.constants];
    } else {
      const breakpoint = input.toInput;
      let inputForBreakpoint = lastOutput.calcInput(breakpoint);

      if (
        inputForBreakpoint === null ||
        (lastOutput.toInput !== null && inputForBreakpoint >= lastOutput.toInput) ||
        inputForBreakpoint <= lastOutput.fromInput
      ) {
        if (lastOutput.toInput) {
          inputForBreakpoint =
            lastOutput.fromInput +
            ((breakpoint - lastOutput.fromOutput) * (lastOutput.toInput - lastOutput.fromInput)) /
              (lastOutput.toOutput - lastOutput.fromOutput);
        } else {
          inputForBreakpoint = null;
        }
      }

      if (
        !inputForBreakpoint ||
        (lastOutput.toInput !== null && inputForBreakpoint >= lastOutput.toInput) ||
        inputForBreakpoint <= lastOutput.fromInput
      ) {
        lastOutput.constants = [...lastOutput.constants, ...input.constants];
        throw new Error('Last range');
      }

      /*if (inputForBreakpoint === 14n) {
        console.log(input);
        console.log(lastOutput);
      }*/

      nextOutput = {
        ...lastOutput,
        fromOutput: breakpoint,
        fromInput: inputForBreakpoint,
      };

      lastOutput.toOutput = breakpoint;
      lastOutput.toInput = inputForBreakpoint;
      lastOutput.constants = [...lastOutput.constants, ...input.constants];
    }
  }

  if (nextOutput) {
    outputRanges.push(nextOutput);
    outputRanges = outputRanges.sort((a, b) =>
      a.fromInput < b.fromInput ? -1 : a.fromInput > b.fromInput ? 1 : 0,
    );
  }

  return outputRanges;
}

export function getNangleSwapRanges(nangle: Nangle): NangleSwapRange[] {
  if (nangle.markets.length < 2) {
    throw new Error('Wrong markets count nangle');
  }

  const marketRanges: MarketSwapRange[][] = nangle.markets.map((market, index) => {
    if (market.protocol === 'uniswapV2') {
      return [getMarketV2SwapRange(market as UniswapV2Market, nangle.actions[index])];
    } else {
      return getMarketV3SwapRanges(market as UniswapV3Market, nangle.actions[index]);
    }
  });

  let nangleRanges: NangleSwapRange[][] = marketRanges.map((marketRange, i) => {
    const calcInput = (output: bigint) =>
      nangle.markets[i].calcTokensIn(nangle.actions[i] === 'sell' ? 'buy' : 'sell', output);

    return marketRange.map((range) => ({
      fromInput: range.fromInput,
      toInput: range.toInput,
      fromOutput: range.fromOutput,
      toOutput: range.toOutput,
      constants: [range.constants],
      calcInput,
    }));
  });

  /*for (const r of nangleRanges) {
    console.log(r[0]);
  }

  nangleRanges = nangleRanges.map(r => [r[0]]);*/

  for (let i = nangleRanges.length - 1; i > 0; i--) {
    const inputRanges = nangleRanges[i];

    try {
      for (const inputRange of inputRanges) {
        nangleRanges[i - 1] = projectNangleSwapRange(inputRange, nangleRanges[i - 1]);
      }
    } catch (ignored) {}
  }

  return nangleRanges[0];
}

function extremumTriangleInternal(
  T1: bigint,
  M1: bigint,
  G1: bigint,
  T2: bigint,
  M2: bigint,
  G2: bigint,
  T3: bigint,
  M3: bigint,
  G3: bigint,
): bigint {
  const forSQRT =
    G1 * G2 * G2 * G2 * G3 * G3 * G3 * M1 * M1 * T1 * T2 * T3 +
    2n * G1 * G2 * G2 * G3 * G3 * G3 * M1 * M2 * T1 * T1 * T2 * T3 +
    2n * G1 * G2 * G2 * G3 * G3 * M1 * M3 * T1 * T1 * T2 * T2 * T3 +
    G1 * G2 * G3 * G3 * G3 * M2 * M2 * T1 * T1 * T1 * T2 * T3 +
    2n * G1 * G2 * G3 * G3 * M2 * M3 * T1 * T1 * T1 * T2 * T2 * T3 +
    G1 * G2 * G3 * M3 * M3 * T1 * T1 * T1 * T2 * T2 * T2 * T3;
  const SQRT = bigIntSqrt(forSQRT);

  const nominator =
    -G1 * G2 * G2 * G3 * G3 * M1 + SQRT - G1 * G2 * G3 * G3 * M2 * T1 - G1 * G2 * G3 * M3 * T1 * T2;
  const denominator =
    G2 * G2 * G3 * G3 * M1 * M1 +
    2n * G2 * G3 * G3 * M1 * M2 * T1 +
    2n * G2 * G3 * M1 * M3 * T1 * T2 +
    G3 * G3 * M2 * M2 * T1 * T1 +
    2n * G3 * M2 * M3 * T1 * T1 * T2 +
    M3 * M3 * T1 * T1 * T2 * T2;

  return nominator / denominator;
}

function zeroTriangleInternal(
  T1: bigint,
  M1: bigint,
  G1: bigint,
  T2: bigint,
  M2: bigint,
  G2: bigint,
  T3: bigint,
  M3: bigint,
  G3: bigint,
): bigint {
  const nominator = T1 * T2 * T3 - G1 * G2 * G3;
  const denominator = G2 * G3 * M1 + G3 * M2 * T1 + M3 * T1 * T2;

  return nominator / denominator;
}

export function getExtremumInput(nangle: Nangle): bigint {
  const ranges = getNangleSwapRanges(nangle);
  console.log(ranges[0]);
  console.log(ranges[1]);
  let firstExtremum = null;

  for (const range of ranges) {
    const cs = range.constants;
    const extremumAmount = extremumTriangleInternal(
      cs[0].T,
      cs[0].M,
      cs[0].G,
      cs[1].T,
      cs[1].M,
      cs[1].G,
      cs[2].T,
      cs[2].M,
      cs[2].G,
    );
    const zeroAmount = zeroTriangleInternal(
      cs[0].T,
      cs[0].M,
      cs[0].G,
      cs[1].T,
      cs[1].M,
      cs[1].G,
      cs[2].T,
      cs[2].M,
      cs[2].G,
    );
    const min = range.fromInput;
    const max = range.toInput;

    if (!firstExtremum) {
      firstExtremum = extremumAmount;
    }

    console.log(min, extremumAmount, zeroAmount, max);
    if (extremumAmount >= min && (max === null || extremumAmount <= max)) {
      //return extremumAmount;
    }

    /*if (max !== null && extremumAmount > max) {
      startAmount = max;
    }*/
  }

  return firstExtremum ?? 0n;
}

export function getExtremumInputAmount(nangle: Nangle): bigint | null {
  if (nangle.markets.length !== 3) {
    return null;
  }

  try {
    const cs: MarketConstants[] = nangle.markets.map((m, i) =>
      getMarketConstants(m, nangle.actions[i]),
    );
    const extremum = extremumTriangleInternal(
      cs[0].T,
      cs[0].M,
      cs[0].G,
      cs[1].T,
      cs[1].M,
      cs[1].G,
      cs[2].T,
      cs[2].M,
      cs[2].G,
    );
    return extremum > 0n ? extremum : null;
  } catch (e) {
    return null;
  }
}

//3322171391958105561n
//943532774756490962n
/*
[
  0, 10
  10, 100,
  100, 300
]
[
  0, 10000
]
[
  0, 33,
  33, 67,
  67, 10000
]

[
  0, 10,
  10, 10,
  10, 100,
  100, 300
]
[
  outputs
  0, 100,
  100, 670,
  670, 10000
]
[
  inputs
  0, 33,
  33, 67,
  67, 1000000,
  1000000, 91291320394
]
*/

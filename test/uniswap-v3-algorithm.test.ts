import { loadNangle } from '../src/serializer';
import { FixedAmountArbitrageStrategy } from '../src/strategies/fixed-amount-arbitrage-strategy';
import {
  bigIntSqrt,
  bigIntSqrtFast,
  endTime,
  EthMarket,
  MarketAction,
  printOpportunity,
  startTime,
  WETH_ADDRESS,
} from '../src/entities';
import { ETHER } from '../src/entities';
import { UniswapV3Market } from '../src/uniswap/uniswap-v3-market';
import {
  MAX_FEE,
  SqrtPriceMath,
  TickMath,
  SwapMath,
} from '../src/uniswap/native-pool/native-pool-utils';
import { NativePool, NativeSwapStep } from '../src/uniswap/native-pool/native-pool';
import { Nangle } from '../src/strategies/nangle';
import fs from 'fs';
import { ProfitFormulas } from '../src/strategies/profit-calculator/profit-formulas';
import {
  getExtremumInput,
  getExtremumInputAmount,
  getNangleSwapRanges,
} from '../src/strategies/profit-calculator';
import { expect } from 'chai';

function swapNangle(nangle: Nangle, amountIn: bigint): bigint | null {
  let amount: bigint | null = amountIn;

  for (let i = 0; i < nangle.markets.length; i++) {
    amount = nangle.markets[i].calcTokensOut(nangle.actions[i], amount);

    if (amount == null) {
      break;
    }
  }

  return amount;
}

function profitNangle(nangle: Nangle, amountIn: bigint): bigint | null {
  return (swapNangle(nangle, amountIn) ?? 0n) - amountIn;
}

function swapNangleFormula(nangle: Nangle, amountIn: bigint): bigint {
  const P = nangle.markets.map((m: any): NativePool => m.pool);

  return ProfitFormulas.swapTriangle(
    P[0].sqrtRatioX96,
    P[0].liquidity,
    BigInt(P[0].fee),
    P[1].sqrtRatioX96,
    P[1].liquidity,
    BigInt(P[1].fee),
    P[2].sqrtRatioX96,
    P[2].liquidity,
    BigInt(P[2].fee),
    amountIn,
    nangle.actions,
  );
}

function encodeItems(items: number[][]): string {
  let str = '';

  for (const item of items) {
    str += `=SPLIT("${item.join(', ')}", ",")\n`;
  }

  return str;
}

function saveChart(
  fileName: string,
  nangle: Nangle,
  fromAmount: bigint,
  toAmount: bigint,
  step: bigint,
  fn: (nangle: Nangle, amountIn: bigint) => bigint = (nangle, amountIn) =>
    swapNangle(nangle, amountIn) ?? 0n,
) {
  let xS: any[] = Array.from({ length: Number((toAmount - fromAmount) / step) }).map(
    (_, i) => fromAmount + BigInt(i) * step,
  );
  const yS = xS.map((x) => {
    const o = fn(nangle, x);
    return Number(o - x) / 10 ** 18;
  });

  xS = xS.map((x) => Number(x / 10n ** 12n));
  fs.writeFileSync(
    fileName,
    encodeItems(
      yS.map((y, i) => {
        return [xS[i], y];
      }),
    ),
  );
}

function saveChartMarket(
  fileName: string,
  market: EthMarket,
  fromAmount: bigint,
  toAmount: bigint,
  step: bigint,
) {
  let xS: any[] = Array.from({ length: Number((toAmount - fromAmount) / step) }).map(
    (_, i) => fromAmount + BigInt(i) * step,
  );
  let yS: any[] = xS.map((x) => {
    //return market.calcTokensOut('sell', x) ?? 0n;
  });

  xS = xS.map((x) => String(x));
  yS = yS.map((y) => String(y));
  fs.writeFileSync(
    fileName,
    encodeItems(
      yS.map((y, i) => {
        return [xS[i], y];
      }),
    ),
  );
}

function binarySearch(nangle: Nangle, maxAmount: bigint, precision: bigint): bigint {
  //TODO: to be optimized
  let l = 0n;
  let r = maxAmount;
  let input: bigint;
  let outputL: bigint | null;
  let outputR: bigint | null;
  let profitL: bigint | null;
  let profitR: bigint | null;

  while (true) {
    input = (l + r) / 2n;

    outputL = swapNangle(nangle, l) ?? 0n;
    outputR = swapNangle(nangle, r) ?? 0n;

    profitL = outputL - l;
    profitR = outputR - r;

    console.log(outputL, Number(profitL) / 10 ** 18);
    console.log(outputR, Number(profitR) / 10 ** 18);

    break;
    /*
    if (ticks[i].index <= tick && (i === ticks.length - 1 || ticks[i + 1].index > tick)) {
      return i;
    }

    if (ticks[i].index < tick) {
      l = i + 1;
    } else {
      r = i - 1;
    }*/
  }

  return 228n;
}

describe('UniswapV3AlgorithmTest', function () {
  this.timeout(10000);
  let nangle = loadNangle('./test/res/nangle.json');
  let oldStrategy = new FixedAmountArbitrageStrategy(
    {
      [WETH_ADDRESS]: new Array(10000).fill(null).map((el, i) => (ETHER / 1000n) * BigInt(i)),
    },
    nangle.markets,
  );
  let oldOpportunity = oldStrategy.calculateOpportunity(nangle as any, 0)!;
  const newOpportunity = { profit: 0n, operations: [] }; // todo вставить сюда свою стратегию

  it('UniswapV3AlgorithmTest1', function () {
    printOpportunity(oldOpportunity);
    console.log(oldOpportunity.operations[0].amountIn);
    console.log(oldOpportunity.profit);

    const X = 172332n ** 1000n;
    startTime();
    console.log(bigIntSqrtFast(X));
    console.log(endTime());
    console.log(bigIntSqrt(X));
    console.log(endTime());

    /*const marketV3 = nangle.markets[0] as UniswapV3Market;
    const breakpoints = marketV3.pool!.ticks.map((tick) => {
      return TickMath.getSqrtRatioAtTick(tick.index);
    });

    const sqrtRatioCurrentX96 = marketV3.pool!.sqrtRatioX96;
    const liquidity = marketV3.pool!.liquidity;
    const fee = marketV3.pool!.fee;
    const fromRange = breakpoints.reduce((acc, breakpoint) => {
      if (breakpoint > sqrtRatioCurrentX96) {
        return acc;
      }

      if (acc < breakpoint) {
        return breakpoint;
      }
      return acc;
    }, breakpoints[0]);

    const fromId = breakpoints.indexOf(fromRange);
    const toRanges = breakpoints.slice(fromId + 1, fromId + 5);
    const toRange = toRanges[0];
    const amountIn = 105000000n;
    console.log(fromRange);
    console.log(toRange);
    console.log(marketV3.pool!.sqrtRatioX96);

    const output = marketV3.calcTokensOut('buy', amountIn);
    console.log(
      `swap ${amountIn} for ${output} at average price of ${Number(output) / Number(amountIn)}`,
    );

    const [sqrtRatioNextX96, _amountIn, amountOut, feeAmount] =
      SwapMath.computeSwapStepSuperSimplifiedOneForZero(
        sqrtRatioCurrentX96,
        toRange,
        liquidity,
        amountIn,
        fee,
      );
    console.log(
      `swap ${_amountIn + feeAmount} for ${amountOut} at average price of ${
        Number(amountOut) / Number(_amountIn + feeAmount)
      }`,
    );
    console.log('---------------');
    const amountIn2 = 50000142547874562n;
    console.log(
      `swap ${amountIn2} for ${marketV3.calcTokensOut('sell', amountIn2)}`,
    );
    SwapMath.computeSwapStepSuperSimplifiedZeroForOne(
      sqrtRatioCurrentX96,
      fromRange,
      liquidity,
      amountIn2,
      fee,
    );*/

    console.log(nangle.actions);
    //startTime();
    const ranges = getNangleSwapRanges(nangle);
    let id = 0;
    for (const range of ranges) {
      if (range.constants.length !== 3) {
        console.log(id, range.constants);
      }
    }
    //console.log(endTime());
    startTime();
    let extremum;
    console.log((extremum = getExtremumInput(nangle)));
    console.log(getExtremumInputAmount(nangle));
    console.log(endTime());
    console.log(oldOpportunity.profit);
    console.log(oldOpportunity.operations[0].amountIn);
    console.log(profitNangle(nangle, extremum));
  });

  //3541854147025631026n
  //7086438364150202404n
  //943532774756490962n
  //1887259045186412467n
  //9210591728604472349n

  it('Find best ticks', function () {
    /*printOpportunity(oldOpportunity);
    console.log(oldOpportunity.profit);

    function accumulatedSwapSteps(market: UniswapV3Market, action: MarketAction): NativeSwapStep[] {
      const steps = market.pool!.swapSteps(action === 'sell');

      for (let i = 1; i < steps.length; i++) {
        const prevStep = steps[i - 1];
        steps[i].amountIn += prevStep.amountIn;
        steps[i].amountOut += prevStep.amountOut;
      }

      return steps;
    }

    function groupSwapStepsBy(steps: NativeSwapStep[], by: 'input' | 'output'): Record<string, NativeSwapStep> {
      const isInput = by === 'input';
      return steps.reduce((acc, step) => {
        if (isInput) {
          acc[step.amountIn.toString()] = step;
        } else {
          acc[step.amountOut.toString()] = step;
        }
        return acc;
      }, {} as Record<string, NativeSwapStep>);
    }

    function fillMissingStepsForPair(stepsA: NativeSwapStep[], stepsB: NativeSwapStep[]): NativeSwapStep[] {
      const groupA = groupSwapStepsBy(stepsA, 'output');
      const groupB = groupSwapStepsBy(stepsB, 'input');
      const stepsAToAdd: NativeSwapStep[] = [];

      for (const amountInBKey in groupB) {
        const groupAKeys = Object.keys(groupA);
        const amountInB = BigInt(amountInBKey);
        const amountOutAKey = groupAKeys.find((amount) => {
          return BigInt(amount) >= amountInB;
        });

        //если не нашли или уже есть токой
        if (!amountOutAKey || amountOutAKey === amountInBKey) {
          //console.log('notfound', amountInB);
          continue;
        }

        const stepA = groupA[amountOutAKey];

        const newAmountInA = (amountInB * stepA.amountIn) / stepA.amountOut;
        const newAmountOutA = amountInB;

        stepsAToAdd.push({
          amountIn: newAmountInA,
          amountOut: newAmountOutA,
          tick: stepA.tick,
        });
      }

      const maxOutputA = BigInt(Object.keys(groupA)[Object.keys(groupA).length - 1]);
      const maxInputB = BigInt(Object.keys(groupB)[Object.keys(groupB).length - 1]);
      console.log('max', maxOutputA, maxInputB);

      return [...stepsA, ...stepsAToAdd].sort((a, b) => {
        return a.amountIn > b.amountIn ? 1 : a.amountIn < b.amountIn ? -1 : 0;
      });
    }

    const stepsA = accumulatedSwapSteps(nangle.markets[0] as UniswapV3Market, nangle.actions[0]);
    const stepsB = accumulatedSwapSteps(nangle.markets[1] as UniswapV3Market, nangle.actions[1]);
    const stepsC = accumulatedSwapSteps(nangle.markets[2] as UniswapV3Market, nangle.actions[2]);

    console.log(
      nangle.markets[0].marketAddress,
      nangle.actions[0],
      stepsA[0],
      stepsA[stepsA.length - 1],
    );
    console.log(
      nangle.markets[1].marketAddress,
      nangle.actions[1],
      stepsB[0],
      stepsB[stepsB.length - 1],
    );
    console.log(
      nangle.markets[2].marketAddress,
      nangle.actions[2],
      stepsC[0],
      stepsC[stepsC.length - 1],
    );
    const inputSteps = fillMissingStepsForPair(stepsA, fillMissingStepsForPair(stepsB, stepsC));
    console.log(stepsA.length);
    console.log(inputSteps.length);

    const P = nangle.markets.map((m: any): NativePool => m.pool);
    const testAmount = 10n ** 18n;
    saveChart('./cache/ch-s.json', nangle, ETHER, ETHER * 6n, ETHER / 100n);
    saveChart('./cache/ch-f.json', nangle, ETHER, ETHER * 6n, ETHER / 100n, (n, x) => {
      const P = n.markets.map((m: any): NativePool => m.pool);
      return NativeFormulas.swapTriangle(
        P[0].sqrtRatioX96,
        P[0].liquidity,
        BigInt(P[0].fee),
        P[1].sqrtRatioX96,
        P[1].liquidity,
        BigInt(P[1].fee),
        P[2].sqrtRatioX96,
        P[2].liquidity,
        BigInt(P[2].fee),
        x,
        nangle.actions,
      );
    });

    startTime();
    const am = NativeFormulas.extremumTriangle(
      P[0].sqrtRatioX96,
      P[0].liquidity,
      BigInt(P[0].fee),
      P[1].sqrtRatioX96,
      P[1].liquidity,
      BigInt(P[1].fee),
      P[2].sqrtRatioX96,
      P[2].liquidity,
      BigInt(P[2].fee),
      nangle.actions,
    );
    console.log(am);
    console.log((swapNangle(nangle, am) ?? 0n) - am);
    console.log(endTime());

    console.log('-----');
    console.log('-----');
    console.log(NativeFormulas.swapTriangle(
      P[0].sqrtRatioX96,
      P[0].liquidity,
      BigInt(P[0].fee),
      P[1].sqrtRatioX96,
      P[1].liquidity,
      BigInt(P[1].fee),
      P[2].sqrtRatioX96,
      P[2].liquidity,
      BigInt(P[2].fee),
      testAmount,
      nangle.actions,
    ));
    console.log('-----');
    console.log(swapNangle(nangle, testAmount));
    console.log('-----');


    for (const inputStep of inputSteps) {
      const inputAmount: bigint = inputStep.amountIn;
      const outputAmount: bigint | null = swapNangle(nangle, inputAmount);

      if (outputAmount !== null) {
        const profit = outputAmount! - inputAmount;
        if (profit >= 0) {
          console.log(`swap ${inputAmount} for ${outputAmount}`);
          console.log('profit', profit, Number(profit) / 10 ** 18);
        }
      } else {
        console.log('fail');
      }
    }

    console.log(inputSteps[0]);*/
  });
});

/*
saveChartMarket('./cache/market.json', marketV3, 0n, ETHER * 1000n, ETHER / 10n);
//console.log(binarySearch(nangle, ETHER * 10n, ETHER / 1000n));
for (let i = 0; i < 67; i++) {
  saveChart(`./cache/chart${i}.json`, loadNangle(`./test/res/nangle${i}.json`), 0n, ETHER * 5n, ETHER / 10n);
}*/

//37530274643
//6115585628
//3104064912269592924
//19068158736933871427

/*
[
  0, 0,
  5, 10,
  50, 90,
  500, 80,
]
[
  0, 0,
  7, 100,
  70, 9000,
  700, 80000,
]
*/

//console.log(ranges);

import { loadNangle } from '../src/serializer';
import { FixedAmountArbitrageStrategy } from '../src/strategies/fixed-amount-arbitrage-strategy';
import { EthMarket, MarketAction, printOpportunity, WETH_ADDRESS } from '../src/entities';
import { ETHER } from '../src/entities';
import { UniswapV3Market } from '../src/uniswap/uniswap-v3-market';
import {
  MAX_FEE,
  SqrtPriceMath,
  TickMath,
  SwapMath,
} from '../src/uniswap/native-pool/native-pool-utils';
import { SwapStep } from '../src/uniswap/native-pool/native-pool';
import { Nangle } from '../src/strategies/nangle';
import fs from 'fs';

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
) {
  let xS: any[] = Array.from({ length: Number((toAmount - fromAmount) / step) }).map(
    (_, i) => fromAmount + BigInt(i) * step,
  );
  const yS = xS.map((x) => {
    const o = swapNangle(nangle, x) ?? 0n;
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
    return market.calcTokensOut('sell', x) ?? 0n;
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

  it('UniswapV3AlgorithmTest', function () {
    printOpportunity(oldOpportunity);
    /*printOpportunity(newOpportunity as any);
    expect(Number(newOpportunity.profit - oldOpportunity.profit)).gt(0);*/
    console.log(oldOpportunity.profit);

    const marketV3 = nangle.markets[0] as UniswapV3Market;
    const marketsV3 = nangle.markets as UniswapV3Market[];
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

    /*const remainingWithoutFee = (amountIn * (MAX_FEE - BigInt(fee))) / MAX_FEE;
    const amount1Delta = SqrtPriceMath.getAmount1Delta(
      sqrtRatioCurrentX96,
      toRange,
      liquidity,
      true,
    );

    const amountInGross = (amount1Delta * MAX_FEE) / (MAX_FEE - BigInt(fee)) + 1000000000n;
    console.log(remainingWithoutFee);
    console.log(amountInGross);
    const input = amountInGross; //1000000000n;*/
    const output = marketV3.calcTokensOut('buy', amountIn);
    console.log(
      `swap ${amountIn} for ${output} at average price of ${Number(output) / Number(amountIn)}`,
    );
    //swap 1000 for 507129710806 at average price of 507129710.806
    //swap 100000 for 50738352833108 at average price of 507383528.33108
    //swap 10000000 for 5073834133482015 at average price of 507383413.3482015
    //swap 1000000000 for 507371915323139641 at average price of 507371915.32313967
    //swap 6118644951 for 3104064912269592924 at average price of 507312474.7600007

    //swap 7118644950 for 3611295990851923032 at average price of 507301040.6077245

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
    return;

    function accumulatedSwapSteps(market: UniswapV3Market, action: MarketAction): SwapStep[] {
      const steps = marketV3.pool!.swapSteps(action === 'sell');

      for (let i = 1; i < steps.length; i++) {
        const prevStep = steps[i - 1];
        steps[i].amountIn += prevStep.amountIn;
        steps[i].amountOut += prevStep.amountOut;
      }

      return steps;
    }

    function groupSwapStepsBy(steps: SwapStep[], by: 'input' | 'output'): Record<string, SwapStep> {
      const isInput = by === 'input';
      return steps.reduce((acc, step) => {
        if (isInput) {
          acc[step.amountIn.toString()] = step;
        } else {
          acc[step.amountOut.toString()] = step;
        }
        return acc;
      }, {} as Record<string, SwapStep>);
    }

    function fillMissingStepsForPair(stepsA: SwapStep[], stepsB: SwapStep[]): SwapStep[] {
      const groupA = groupSwapStepsBy(stepsA, 'output');
      const groupB = groupSwapStepsBy(stepsB, 'input');
      const stepsAToAdd: SwapStep[] = [];

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
        //const stepB = groupB[amountInBKey];

        const newAmountInA = (amountInB * stepA.amountIn) / stepA.amountOut;
        const newAmountOutA = amountInB;

        stepsAToAdd.push({
          amountIn: newAmountInA,
          amountOut: newAmountOutA,
          tick: stepA.tick,
        });

        /*console.log(amountInB);
        console.log(amountOutA);
        console.log(stepA);
        console.log(stepB);
        console.log(newAmountInA);
        console.log(newAmountOutA);
        break;*/
      }

      const maxOutputA = BigInt(Object.keys(groupA)[Object.keys(groupA).length - 1]);
      const maxInputB = BigInt(Object.keys(groupB)[Object.keys(groupB).length - 1]);
      console.log('max', maxOutputA, maxInputB);

      return [...stepsA, ...stepsAToAdd].sort((a, b) => {
        return a.amountIn > b.amountIn ? 1 : a.amountIn < b.amountIn ? -1 : 0;
      });
    }

    /*for (let i = 0; i < nangle.markets.length; i++) {
      const marketV3 = nangle.markets[i] as UniswapV3Market;
      const action = nangle.actions[i];
      const steps = accumulatedSwapSteps(marketV3, action);

      if (i !== 0) {
        continue;
      }

      console.log(nangle.actions[0], accumulatedSwapSteps(nangle.markets[0] as UniswapV3Market, nangle.actions[0])[0]);
      console.log(nangle.actions[1], accumulatedSwapSteps(nangle.markets[1] as UniswapV3Market, nangle.actions[1])[0]);
      const stepsA = accumulatedSwapSteps(nangle.markets[0] as UniswapV3Market, nangle.actions[0]);
      const stepsB = accumulatedSwapSteps(nangle.markets[1] as UniswapV3Market, nangle.actions[1]);
      const stepsANew = fillMissingStepsForPair(stepsA, stepsB);
    }*/

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

    /*    saveChartMarket('./cache/market.json', marketV3, 0n, ETHER * 1000n, ETHER / 10n);
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
  });
});

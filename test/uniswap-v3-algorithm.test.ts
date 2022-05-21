import { loadNangle } from '../src/serializer';
import { TriangleArbitrageStrategy } from '../src/triangle/triangle-arbitrage-strategy';
import { MarketAction, printOpportunity, WETH_ADDRESS } from '../src/entities';
import { ETHER } from '../src/entities';
import { UniswapV3Market } from '../src/uniswap/uniswap-v3-market';
import { MAX_FEE, SqrtPriceMath, TickMath } from '../src/uniswap/native-pool/native-pool-utils';
import { SwapStep } from '../src/uniswap/native-pool/native-pool';

describe('UniswapV3AlgorithmTest', function () {
  this.timeout(10000);
  let nangle = loadNangle('./test/res/nangle.json');
  let oldStrategy = new TriangleArbitrageStrategy(
    {
      [WETH_ADDRESS]: [ETHER * 5n],
    },
    nangle.markets,
  );
  let oldOpportunity = oldStrategy.calculateOpportunity(nangle as any, 0)!;

  it('UniswapV3AlgorithmTest', function () {
    printOpportunity(oldOpportunity);

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
    const amountIn = 6105000000n;
    console.log(fromRange);
    console.log(toRange);
    console.log(marketV3.pool!.sqrtRatioX96);

    const remainingWithoutFee = (amountIn * (MAX_FEE - BigInt(fee))) / MAX_FEE;
    const amount1Delta = SqrtPriceMath.getAmount1Delta(
      sqrtRatioCurrentX96,
      toRange,
      liquidity,
      true,
    );
    const maxPossible = SqrtPriceMath.getAmount1Delta(
      sqrtRatioCurrentX96,
      toRange,
      liquidity,
      true,
    );

    const amountInGross = (amount1Delta * MAX_FEE) / (MAX_FEE - BigInt(fee)) + 1000000000n;
    console.log(remainingWithoutFee);
    console.log(amountInGross);
    const input = amountInGross; //1000000000n;
    const output = marketV3.calcTokensOut('buy', input);
    console.log(
      `swap ${input} for ${output} at average price of ${Number(output) / Number(input)}`,
    );
    //swap 1000 for 507129710806 at average price of 507129710.806
    //swap 100000 for 50738352833108 at average price of 507383528.33108
    //swap 10000000 for 5073834133482015 at average price of 507383413.3482015
    //swap 1000000000 for 507371915323139641 at average price of 507371915.32313967
    //swap 6118644951 for 3104064912269592924 at average price of 507312474.7600007

    //swap 7118644950 for 3611295990851923032 at average price of 507301040.6077245

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
      let amount: bigint | null = inputStep.amountIn;

      for (let i = 0; i < nangle.markets.length; i++) {
        const marketV3 = nangle.markets[i] as UniswapV3Market;
        const action = nangle.actions[i];
        amount = marketV3.calcTokensOut(action, amount);

        if (amount == null) {
          break;
        }
      }

      if (amount !== null) {
        const profit = amount - inputAmount;
        console.log(`swap ${inputAmount} for ${amount}`);
        console.log('profit', profit, Number(profit) / 10 ** 18);
      } else {
        console.log('fail');
      }
    }

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

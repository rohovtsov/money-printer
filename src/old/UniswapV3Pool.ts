import { FeeAmount, Pool, Tick } from '@uniswap/v3-sdk';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { ChainId, JSBI } from '@uniswap/sdk';
import { Contract, providers } from 'ethers';
import {
  Address,
  endTime,
  ERC20_ABI,
  PRINTER_QUERY_ABI,
  PRINTER_QUERY_ADDRESS,
  startTime,
  UNISWAP_POOL_ABI,
  UNISWAP_V3_QUOTER_ABI,
  UNISWAP_V3_QUOTER_ADDRESS,
} from './entities';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import ApolloClient from 'apollo-boost';
import gql from 'graphql-tag';

const ZERO = JSBI.BigInt(0);
const ONE = JSBI.BigInt(1);

function assert(expression: boolean, message: string) {
  if (!expression) {
    throw new Error(message);
  }
}

const FixedPoint128 = {
  Q128: JSBI.BigInt('340282366920938463463374607431768211456'),
};

abstract class FullMath {
  public static mulDiv(a: JSBI, b: JSBI, denominator: JSBI): JSBI {
    return JSBI.divide(JSBI.multiply(a, b), denominator);
  }

  public static mulDivRoundingUp(a: JSBI, b: JSBI, denominator: JSBI): JSBI {
    const product = JSBI.multiply(a, b);
    let result = JSBI.divide(product, denominator);
    if (JSBI.notEqual(JSBI.remainder(product, denominator), ZERO)) result = JSBI.add(result, ONE);
    return result;
  }
}

interface SwapResult {
  amount0: JSBI;
  amount1: JSBI;
}

interface Slot0 {
  sqrtPriceX96: JSBI;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

interface SwapCache {
  feeProtocol: number;
  liquidityStart: JSBI;
  blockTimestamp: number;
  tickCumulative: JSBI;
  secondsPerLiquidityCumulativeX128: JSBI;
  computedLatestObservation: boolean;
}

interface SwapState {
  amountSpecifiedRemaining: JSBI;
  amountCalculated: JSBI;
  sqrtPriceX96: JSBI;
  tick: number;
  feeGrowthGlobalX128: JSBI;
  protocolFee: JSBI;
  liquidity: JSBI;
}

interface StepComputations {
  sqrtPriceStartX96: JSBI;
  tickNext: number;
  initialized: boolean;
  sqrtPriceNextX96: JSBI;
  amountIn: JSBI;
  amountOut: JSBI;
  feeAmount: JSBI;
}

class TicksProvider {
  constructor(private map: Record<string, JSBI>) {}
}

/*

class UniswapV3Pool {
  swap(
    tickBitmap: TickBitmap,
    ticks: TickBitmap,
    slot0: Slot0,
    liquidity: JSBI,
    feeGrowthGlobal0X128: JSBI,
    feeGrowthGlobal1X128: JSBI,
    tickSpacing: number,
    fee: number,

    zeroForOne: boolean,
    amountSpecified: JSBI,
    sqrtPriceLimitX96: JSBI,
  ): SwapResult {
    assert(JSBI.notEqual(amountSpecified, ZERO), 'AS');

    //TODO: {...copying} || = copy?
    const slot0Start: Slot0 = { ...slot0 };

    assert(slot0Start.unlocked, 'LOK');
    assert(
      zeroForOne
        ? JSBI.lessThan(sqrtPriceLimitX96, slot0Start.sqrtPriceX96) && JSBI.greaterThan(sqrtPriceLimitX96, TickMath.MIN_SQRT_RATIO)
        : JSBI.greaterThan(sqrtPriceLimitX96, slot0Start.sqrtPriceX96) && JSBI.lessThan(sqrtPriceLimitX96, TickMath.MAX_SQRT_RATIO),
      'SPL'
    );

    slot0.unlocked = false;

    const cache: SwapCache = {
      liquidityStart: liquidity,
      blockTimestamp: this._blockTimestamp(),
      feeProtocol: zeroForOne ? (slot0Start.feeProtocol % 16) : (slot0Start.feeProtocol >> 4),
      secondsPerLiquidityCumulativeX128: JSBI.BigInt(0),
      tickCumulative: JSBI.BigInt(0),
      computedLatestObservation: false
    };

    const exactInput: boolean = JSBI.greaterThan(amountSpecified, ZERO);

    const state: SwapState = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: JSBI.BigInt(0),
      sqrtPriceX96: slot0Start.sqrtPriceX96,
      tick: slot0Start.tick,
      feeGrowthGlobalX128: zeroForOne ? feeGrowthGlobal0X128 : feeGrowthGlobal1X128,
      protocolFee: JSBI.BigInt(0),
      liquidity: cache.liquidityStart
    };

    while (JSBI.notEqual(state.amountSpecifiedRemaining, ZERO) && JSBI.notEqual(state.sqrtPriceX96, sqrtPriceLimitX96)) {
      //TODO: is it reinitialized??
      const step: StepComputations = {
        sqrtPriceStartX96: JSBI.BigInt(0),
        tickNext: 0,
        initialized: false,
        sqrtPriceNextX96: JSBI.BigInt(0),
        amountIn: JSBI.BigInt(0),
        amountOut: JSBI.BigInt(0),
        feeAmount: JSBI.BigInt(0)
      };

      step.sqrtPriceStartX96 = state.sqrtPriceX96;

      const { next, initialized } = tickBitmap.nextInitializedTickWithinOneWord(
        state.tick,
        tickSpacing,
        zeroForOne
      );
      step.tickNext = next;
      step.initialized = initialized;

      if (step.tickNext < TickMath.MIN_TICK) {
        step.tickNext = TickMath.MIN_TICK;
      } else if (step.tickNext > TickMath.MAX_TICK) {
        step.tickNext = TickMath.MAX_TICK;
      }

      step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);

      const [sqrtPriceX96, amountIn, amountOut, feeAmount] = SwapMath.computeSwapStep(
        state.sqrtPriceX96,
        (zeroForOne ? JSBI.lessThan(step.sqrtPriceNextX96, sqrtPriceLimitX96) : JSBI.greaterThan(step.sqrtPriceNextX96, sqrtPriceLimitX96))
          ? sqrtPriceLimitX96
          : step.sqrtPriceNextX96,
        state.liquidity,
        state.amountSpecifiedRemaining,
        fee
      );
      state.sqrtPriceX96 = sqrtPriceX96;
      step.amountIn = amountIn;
      step.amountOut = amountOut;
      step.feeAmount = feeAmount;

      if (exactInput) {
        state.amountSpecifiedRemaining = JSBI.subtract(state.amountSpecifiedRemaining, JSBI.add(step.amountIn, step.feeAmount));
        state.amountCalculated = JSBI.subtract(state.amountCalculated, step.amountOut);
      } else {
        state.amountSpecifiedRemaining = JSBI.add(state.amountSpecifiedRemaining, step.amountOut);
        state.amountCalculated = JSBI.add(state.amountCalculated, JSBI.add(step.amountIn, step.feeAmount));
      }

      if (cache.feeProtocol > 0) {
        const delta = JSBI.divide(step.feeAmount, JSBI.BigInt(cache.feeProtocol));
        step.feeAmount = JSBI.subtract(step.feeAmount, delta);
        state.protocolFee = JSBI.add(state.protocolFee, delta);
      }

      if (JSBI.greaterThan(state.liquidity, ZERO)) {
        state.feeGrowthGlobalX128 = JSBI.add(
          state.feeGrowthGlobalX128,
          FullMath.mulDiv(step.feeAmount, FixedPoint128.Q128, state.liquidity)
        );
      }

      // shift tick if we reached the next price
      if (JSBI.equal(state.sqrtPriceX96, step.sqrtPriceNextX96)) {
        // if the tick is initialized, run the tick transition
        if (step.initialized) {
          let liquidityNet: JSBI = ticks[step.tickNext].liquidityNet;

          if (zeroForOne) {
            liquidityNet = JSBI.multiply(liquidityNet, JSBI.BigInt(-1));
          }

          state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
        }

        state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
      } else if (state.sqrtPriceX96 != step.sqrtPriceStartX96) {
        // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
        state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
      }
    }

    let amount0: JSBI;
    let amount1: JSBI;

    if (zeroForOne === exactInput) {
      amount0 = JSBI.subtract(amountSpecified, state.amountSpecifiedRemaining);
      amount1 = state.amountCalculated;
    } else {
      amount0 = state.amountCalculated;
      amount1 = JSBI.subtract(amountSpecified, state.amountSpecifiedRemaining);
    }

    /!*    if (zeroForOne) {
      if (amount1 < 0) TransferHelper.safeTransfer(token1, recipient, uint256(-amount1));

      uint256 balance0Before = balance0();
      require(balance0Before.add(uint256(amount0)) <= balance0(), 'IIA');
    } else {
      if (amount0 < 0) TransferHelper.safeTransfer(token0, recipient, uint256(-amount0));

      uint256 balance1Before = balance1();
      require(balance1Before.add(uint256(amount1)) <= balance1(), 'IIA');
    }*!/

    console.log(
      'Swap\n' +
      `${amount0.toString()}\n` +
      `${amount1.toString()}\n` +
      `${state.sqrtPriceX96.toString()}\n` +
      `${state.liquidity.toString()}\n` +
      `${state.tick.toString()}\n`
    );

    slot0.unlocked = true;

    return { amount0, amount1 };
  }

  _blockTimestamp(): number {
    //TODO: millis or micros???
    //uint32(block.timestamp); // truncation is desired
    return 0;
  }
}
*/

export async function swapTest(
  uniswapV3Market: UniswapV3Market,
  provider: providers.JsonRpcProvider,
) {
  await swapLocal(uniswapV3Market, provider);
}

const fetch = require('node-fetch');
async function requestTicksForPool(pool: Address): Promise<Tick[]> {
  const client = new ApolloClient({
    // uri: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    uri: 'https://api.thegraph.com/subgraphs/name/kmkoushik/uniswap-v3-ropsten',
    fetch,
  });

  const query = gql`
      query TicksPool($random: BigInt) {
        ticks(first: 1000, orderBy: tickIdx, where: { 
          poolAddress: "${pool.toLowerCase()}"
        }) { 
          tickIdx
          liquidityGross 
          liquidityNet
        }
      }
  `;

  const result = await client.query({
    query,
    variables: {
      random: Math.round(Math.random() * 10000000),
    },
  });

  console.log(`Loaded ticks: ${result.data.ticks.length}`);

  return result.data.ticks.map(
    (data: any) =>
      new Tick({
        index: Number(data.tickIdx),
        liquidityGross: JSBI.BigInt(data.liquidityGross),
        liquidityNet: JSBI.BigInt(data.liquidityNet),
      }),
  );
}

export async function swapLocal(pool: UniswapV3Market, provider: providers.JsonRpcProvider) {
  console.log(pool.marketAddress);
  console.log(pool.tokens[0]);
  console.log(pool.tokens[1]);
  const ticks = await requestTicksForPool(pool.marketAddress);

  /*const query = new Contract(PRINTER_QUERY_ADDRESS, PRINTER_QUERY_ABI, provider);
  const result = (await Promise.all([
    query.functions.getStateForPool(pool.marketAddress),
    query.functions.getTicksForPool(pool.marketAddress, 500),
    query.functions.getTickBitmapForPool(pool.marketAddress, -32500, 32500),
  ]));
  const state = result[0][0];*/

  const poolContract = new Contract(pool.marketAddress, UNISWAP_POOL_ABI, provider);

  const slot0 = await poolContract.functions.slot0();
  const liquidity = (await poolContract.functions.liquidity())[0];

  const poolToken0 = new Token(ChainId.MAINNET, pool.tokens[0], 0);
  const poolToken1 = new Token(ChainId.MAINNET, pool.tokens[1], 0);
  const sdkPool = new Pool(
    poolToken0,
    poolToken1,
    pool.fee as FeeAmount,
    JSBI.BigInt(slot0.sqrtPriceX96.toString()),
    JSBI.BigInt(liquidity.toString()),
    slot0.tick,
    ticks,
  );

  const oracleContract = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
  const inputAmount = 1000000000000;
  const outputContract = await oracleContract.callStatic.quoteExactInputSingle(
    pool.tokens[0],
    pool.tokens[1],
    Number(pool.fee),
    inputAmount.toString(),
    0,
  );

  startTime('time');
  const [output] = await sdkPool.getOutputAmount(
    CurrencyAmount.fromRawAmount(poolToken0, JSBI.BigInt(inputAmount)),
  );
  console.log(output);
  console.log(endTime('time'));
  console.log(output.toSignificant(100));
  console.log(outputContract.toString());
}

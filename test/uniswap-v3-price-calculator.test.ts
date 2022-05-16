import { BigNumber, Contract, providers } from 'ethers';
import { UniswapV3MarketFactory } from '../src/uniswap/uniswap-v3-market-factory';
import {
  GWEI,
  ETHER,
  UNISWAP_V3_FACTORY_ADDRESS,
  UNISWAP_V3_QUOTER_ABI,
  UNISWAP_V3_QUOTER_ADDRESS,
  startTime,
  endTime,
} from '../src/entities';
import { UniswapV3Market } from '../src/uniswap/uniswap-v3-market';
import { UniswapV3PoolStateSyncer } from '../src/uniswap/uniswap-v3-pool-state-syncer';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import { ChainId, JSBI } from '@uniswap/sdk';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { expect } from 'chai';
import { NativePool } from '../src/uniswap/native-pool/native-pool';
import { NativeTick } from '../src/uniswap/native-pool/native-pool-utils';
import fs from 'fs';

function calcPricesWithSyncPool(market: UniswapV3Market, amount: BigNumber) {
  let results = [];

  try {
    results.push(market.calcTokensOut('sell', amount));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(market.calcTokensOut('buy', amount));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(market.calcTokensIn('sell', amount));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(market.calcTokensIn('buy', amount));
  } catch (e) {
    results.push(null);
  }

  return results;
}

function performanceTest(pool: NativePool, market: UniswapV3Market, amount0: BigNumber) {
  startTime();
  let output;
  let nativeTime;
  let syncTime;
  let amount = amount0;
  for (let i = 0; i < 100; i++) {
    output = calcPricesWithNativePool(pool, amount);
    amount = amount.mul(BigNumber.from(2));
  }
  console.log('native swap', output?.[0]?.toString(), (nativeTime = endTime()));

  startTime();
  amount = amount0;
  for (let i = 0; i < 100; i++) {
    output = calcPricesWithSyncPool(market, amount);
    amount = amount.mul(2);
  }
  console.log('sync sdk', output?.[0]?.toString(), (syncTime = endTime()));
  console.log(`native is faster ${syncTime / nativeTime}`);
}

function testOutputs(pool: NativePool, market: UniswapV3Market, amount: BigNumber) {
  startTime();
  let outputs0, outputs1;
  for (let i = 0; i < 100; i++) {
    outputs0 = calcPricesWithNativePool(pool, amount);
    outputs1 = calcPricesWithSyncPool(market, amount);
    amount = amount.mul(BigNumber.from(2));

    for (let i = 0; i < 4; i++) {
      expect(outputs0[i]?.toString()).equal(outputs1[i]?.toString());
    }
  }
}

async function calcPricesWithSdkPool(market: UniswapV3Market, amount: BigNumber) {
  const token0 = new Token(ChainId.MAINNET, market.tokens[0], 0);
  const token1 = new Token(ChainId.MAINNET, market.tokens[1], 0);

  const pool = new Pool(
    token0,
    token1,
    market.fee as FeeAmount,
    JSBI.BigInt(market.pool?.sqrtRatioX96 ?? 0),
    JSBI.BigInt(market.pool?.liquidity ?? 0),
    market.pool?.tickCurrent ?? 0,
    (market.pool?.tickDataProvider as any)?.ticks,
  );

  const result = await Promise.all([
    pool.getOutputAmount(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(amount.toString()))),
    pool.getOutputAmount(CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(amount.toString()))),
    pool.getInputAmount(CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(amount.toString()))),
    pool.getInputAmount(CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(amount.toString()))),
  ]);

  return result.map((res, index) => {
    const isInput = index >= 2;

    if (isInput && JSBI.lessThanOrEqual(res[1].liquidity, JSBI.BigInt(0))) {
      return null;
    }

    if (amount.lte(0)) {
      return null;
    }

    return BigNumber.from(res[0].toSignificant(100));
  });
}

function createNativePool(market: UniswapV3Market): NativePool {
  return new NativePool(
    market.tokens[0],
    market.tokens[1],
    market.fee as FeeAmount,
    BigInt(market.pool?.sqrtRatioX96?.toString() ?? 0),
    BigInt(market.pool?.liquidity?.toString() ?? 0),
    market.pool?.tickCurrent ?? 0,
    (market.pool?.tickDataProvider as any)?.ticks.map(
      (tick: any) =>
        new NativeTick(tick.index, BigInt(tick.liquidityGross), BigInt(tick.liquidityNet)),
    ),
  );
}

function calcPricesWithNativePool(pool: NativePool, amount: BigNumber) {
  let results = [];

  try {
    results.push(pool.getOutputAmount(pool.token0, BigInt(amount.toString())));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(pool.getOutputAmount(pool.token1, BigInt(amount.toString())));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(pool.getInputAmount(pool.token0, BigInt(amount.toString())));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(pool.getInputAmount(pool.token1, BigInt(amount.toString())));
  } catch (e) {
    results.push(null);
  }

  return results;
}

describe('UniswapV3PriceCalculator', function () {
  const provider = new providers.InfuraProvider('mainnet', '8ac04e84ff9e4fd19db5bfa857b90a92');
  this.timeout(15000);

  it('equal prices for contract, sdk, and sync sdk', async function () {
    const factory = new UniswapV3MarketFactory(provider, UNISWAP_V3_FACTORY_ADDRESS, 12380000);
    const syncer = new UniswapV3PoolStateSyncer(provider, 10);
    const markets = await factory.getEthMarkets();

    const market = markets.find(
      (m) => m.marketAddress.toLowerCase() === '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8',
    ) as UniswapV3Market;
    const quoter = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
    const amount = BigNumber.from('442535578348252745435545345534');

    const contractPrices = await Promise.all([
      quoter.callStatic
        .quoteExactInputSingle(market.tokens[0], market.tokens[1], market.fee, amount.toString(), 0)
        .catch(() => null),
      quoter.callStatic
        .quoteExactInputSingle(market.tokens[1], market.tokens[0], market.fee, amount.toString(), 0)
        .catch(() => null),
      quoter.callStatic
        .quoteExactOutputSingle(
          market.tokens[1],
          market.tokens[0],
          market.fee,
          amount.toString(),
          0,
        )
        .catch(() => null),
      quoter.callStatic
        .quoteExactOutputSingle(
          market.tokens[0],
          market.tokens[1],
          market.fee,
          amount.toString(),
          0,
        )
        .catch(() => null),
      syncer.syncPoolStates([market]),
    ]);

    //saveMarket('sample-market.json', market);
    const nativePool = createNativePool(market);
    const syncPrices = calcPricesWithSyncPool(market, amount);
    const nativePrices = calcPricesWithNativePool(nativePool, amount);
    const sdkPrices = await calcPricesWithSdkPool(market, amount);

    performanceTest(nativePool, market, amount);
    testOutputs(nativePool, market, amount);

    console.log(contractPrices.slice(0, 4).map((b) => b?.toString()));
    console.log(sdkPrices.map((b) => b?.toString()));
    console.log(nativePrices.map((b) => b?.toString()));

    for (let i = 0; i < 4; i++) {
      expect(contractPrices[i]?.toString()).equal(sdkPrices[i]?.toString());
      expect(contractPrices[i]?.toString()).equal(syncPrices[i]?.toString());
      expect(contractPrices[i]?.toString()).equal(nativePrices[i]?.toString());
    }
  });
});

/*
Profit: -99999304748229172238 of WETH
Path: 100000000000000000000 > buy > 33563660622520811881271 > sell > 2095574 > sell > 695251770827762
https://etherscan.io/token/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
https://etherscan.io/token/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984
https://etherscan.io/token/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
Markets:
https://etherscan.io/address/0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801#readContract
https://etherscan.io/address/0xE845469aAe04f8823202b011A848cf199420B4C1#readContract
https://etherscan.io/address/0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387#readContract
*/

function saveMarket(fileName: string, market: UniswapV3Market): void {
  fs.writeFileSync(
    fileName,
    JSON.stringify(
      {
        ticks: (market?.pool?.advancedTicks ?? []).map((tick: any) => ({
          index: tick.index,
          liquidityGross: tick.liquidityGross.toString(),
          liquidityNet: tick.liquidityNet.toString(),
        })),
        token1: market!.tokens[1],
        token0: market!.tokens[0],
        fee: market.fee,
        tick: market!.pool!.tickCurrent,
        sqrtRatioX96: market!.pool!.sqrtRatioX96.toString(),
        liquidity: market!.pool!.liquidity.toString(),
      },
      null,
      2,
    ),
  );
}

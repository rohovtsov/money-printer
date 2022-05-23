import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import { NativeTick } from './uniswap/native-pool/native-pool-utils';
import { UniswapV2Market } from './uniswap/uniswap-v2-market';
import { Address, EthMarket, MarketAction } from './entities';
import { Nangle } from './strategies/nangle';
import fs from 'fs';

function serializeV3Market(market: UniswapV3Market): any {
  return {
    protocol: market.protocol,
    ticks: (market?.pool?.ticks ?? []).map((tick: any) => ({
      index: tick.index,
      liquidityGross: tick.liquidityGross.toString(),
      liquidityNet: tick.liquidityNet.toString(),
    })),
    marketAddress: market!.marketAddress,
    token0: market!.tokens[0],
    token1: market!.tokens[1],
    tickSpacing: market!.tickSpacing,
    fee: market.fee,
    tick: market!.pool!.tickCurrent,
    sqrtRatioX96: market!.pool!.sqrtRatioX96.toString(),
    liquidity: market!.pool!.liquidity.toString(),
  };
}

function deserializeV3Market(data: any): UniswapV3Market {
  const market = new UniswapV3Market(
    data.marketAddress,
    [data.token0, data.token1],
    data.fee,
    data.tickSpacing,
  );

  market.setPoolState(
    data.tick,
    BigInt(data.sqrtRatioX96),
    BigInt(data.liquidity),
    data.ticks.map(
      (tick: any) =>
        new NativeTick(tick.index, BigInt(tick.liquidityGross), BigInt(tick.liquidityNet)),
    ),
  );

  return market;
}

function serializeV2Market(market: UniswapV2Market): any {
  return {
    protocol: market.protocol,
    marketAddress: market!.marketAddress,
    token0: market!.tokens[0],
    token1: market!.tokens[1],
    reserves0: market!.getReserve0()!.toString(),
    reserves1: market!.getReserve1()!.toString(),
  };
}

function deserializeV2Market(data: any): UniswapV2Market {
  const market = new UniswapV2Market(data.marketAddress, [data.token0, data.token1]);

  market.setTokenReserves(BigInt(data.reserves0), BigInt(data.reserves1));
  return market;
}

export function serializeMarket(market: EthMarket): any {
  if (market.protocol === 'uniswapV2') {
    return serializeV2Market(market as UniswapV2Market);
  } else if (market.protocol === 'uniswapV3') {
    return serializeV3Market(market as UniswapV3Market);
  } else {
    throw new Error('Protocol not supported');
  }
}

export function deserializeMarket(data: any): EthMarket {
  if (data.protocol === 'uniswapV2') {
    return deserializeV2Market(data);
  } else if (data.protocol === 'uniswapV3') {
    return deserializeV3Market(data);
  } else {
    throw new Error('Protocol not supported');
  }
}

export function serializeNangle(nangle: Nangle): any {
  return {
    markets: nangle.markets.map((m) => serializeMarket(m)),
    actions: nangle.actions,
    startToken: nangle.startToken,
  };
}

export function deserializeNangle(data: any): Nangle {
  return {
    markets: data.markets.map((dataM: any) => deserializeMarket(dataM)),
    actions: data.actions,
    startToken: data.startToken,
  };
}

export function saveNangle(fileName: string, nangle: Nangle): void {
  fs.writeFileSync(fileName, JSON.stringify(serializeNangle(nangle), null, 2));
}

export function loadNangle(fileName: string): Nangle {
  return deserializeNangle(JSON.parse(fs.readFileSync(fileName).toString()));
}

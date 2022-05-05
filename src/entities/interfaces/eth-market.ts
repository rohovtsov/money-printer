import { BigNumber } from 'ethers';

export interface MultipleCallData {
  targets: Array<string>;
  data: Array<string>;
}

export interface CallData {
  target: string;
  data: string;
}

export interface CallDetails {
  target: string;
  data: string;
  value?: BigNumber;
}

export type Address = string;
export type Protocol = 'uniswapV2' | 'uniswapV3';
export type MarketAction = 'buy' | 'sell';

export type EthMarketsByToken<T extends EthMarket = EthMarket> = Record<Address, T[]>;
export type GroupedEthMarkets<T extends EthMarket = EthMarket> = {
  markets: T[];
  marketsByToken: EthMarketsByToken<T>;
};

export interface EthMarket {
  tokens: [Address, Address];
  marketAddress: Address;
  protocol: Protocol;

  hasEnoughReserves(tokenAddress: string, minReserve: BigNumber): boolean;

  calcTokensOut(action: MarketAction, amountIn: BigNumber): BigNumber | null;

  calcTokensIn(action: MarketAction, amountOut: BigNumber): BigNumber | null;

  performSwap(
    amountIn: BigNumber,
    action: MarketAction,
    recipient: string | EthMarket,
  ): Promise<CallData>;
}

export function groupEthMarkets(markets: EthMarket[]): GroupedEthMarkets {
  const marketsByToken = markets.reduce((acc, market) => {
    (acc[market.tokens[0]] ?? (acc[market.tokens[0]] = [])).push(market);
    (acc[market.tokens[1]] ?? (acc[market.tokens[1]] = [])).push(market);
    return acc;
  }, {} as EthMarketsByToken);

  return {
    markets,
    marketsByToken,
  };
}

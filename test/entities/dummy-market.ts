import { Address, CallData, EthMarket, MarketAction, Protocol } from '../../src/entities';

export class DummyMarket implements EthMarket {
  readonly protocol = 'dummy' as Protocol;

  constructor(readonly marketAddress: Address, readonly tokens: [Address, Address]) {}

  calcTokensIn(action: MarketAction, amountOut: bigint): bigint | null {
    return null;
  }

  calcTokensOut(action: MarketAction, amountIn: bigint): bigint | null {
    return null;
  }

  performSwap(
    amountIn: bigint,
    action: MarketAction,
    recipient: string | EthMarket,
    data: string | [],
  ): Promise<CallData> {
    return Promise.resolve({ data: '', target: '' });
  }
}

export function createDummyMarkets(config: [string, string][]): DummyMarket[] {
  return config.map((conf, index) => {
    return new DummyMarket(`M${index}`, conf);
  });
}

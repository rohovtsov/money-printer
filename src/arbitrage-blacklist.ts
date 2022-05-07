import { Address, EthMarket } from './entities';
const { toChecksumAddress } = require('ethereum-checksum-address');

export class ArbitrageBlacklist {
  readonly blacklistMarkets: Set<Address>;
  readonly blacklistTokens: Set<Address>;

  constructor(blacklistMarkets: Address[], blacklistTokens: Address[]) {
    this.blacklistMarkets = new Set<Address>(blacklistMarkets.map((t) => toChecksumAddress(t)));
    this.blacklistTokens = new Set<Address>(blacklistTokens.map((t) => toChecksumAddress(t)));
  }

  filterMarkets(markets: EthMarket[]): EthMarket[] {
    const allowedMarkets = excludeMarkets(markets, this.blacklistMarkets, this.blacklistTokens);
    console.log(
      `Allowed markets: ${allowedMarkets.length}, blacklisted markets: ${
        markets.length - allowedMarkets.length
      }`,
    );
    return allowedMarkets;
  }
}

function excludeMarkets(
  markets: EthMarket[],
  exclude: Set<Address>,
  excludeTokens: Set<Address>,
): EthMarket[] {
  return markets.filter(
    (market) =>
      !exclude.has(market.marketAddress) &&
      !excludeTokens.has(market.tokens[0]) &&
      !excludeTokens.has(market.tokens[1]),
  );
}

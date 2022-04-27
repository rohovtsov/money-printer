import {
  Address, EthMarket,
} from './entities';
const { toChecksumAddress } = require('ethereum-checksum-address');



export class ArbitrageBlacklist {
  readonly blacklistSet = new Set<Address>();

  constructor(blacklist: Address[]) {
    for (const address of blacklist) {
      this.blacklistSet.add(toChecksumAddress(address));
    }
  }

  filterMarkets(markets: EthMarket[]): EthMarket[] {
    const allowedMarkets = excludeMarkets(markets, this.blacklistSet);
    console.log(`Allowed markets: ${allowedMarkets.length}, blacklisted markets: ${markets.length - allowedMarkets.length}`);
    return allowedMarkets;
  }
}

function excludeMarkets(markets: EthMarket[], exclude: Set<Address>): EthMarket[] {
  return markets.filter(market => !exclude.has(market.marketAddress));
}

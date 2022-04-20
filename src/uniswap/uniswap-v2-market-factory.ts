import {
  Address,
  EthMarketFactory,
  UNISWAP_LOOKUP_CONTRACT_ADDRESS,
  UNISWAP_QUERY_ABI,
} from '../entities';
import { UniswapV2Market } from './uniswap-v2-market';
import { Contract, providers } from 'ethers';

export class UniswapV2MarketFactory implements EthMarketFactory {
  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly factoryAddress: Address,
    readonly batchCountLimit: number,
    readonly batchSize: number,
  ) { }

  async getEthMarkets(): Promise<UniswapV2Market[]> {
    const uniswapQuery = new Contract(UNISWAP_LOOKUP_CONTRACT_ADDRESS, UNISWAP_QUERY_ABI, this.provider);

    const marketPairs = new Array<UniswapV2Market>();
    for (let i = 0; i < this.batchCountLimit * this.batchSize; i += this.batchSize) {
      const pairs: Array<Array<string>> = (await uniswapQuery.functions.getPairsByIndexRange(this.factoryAddress, i, i + this.batchSize))[0];

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const marketAddress = pair[2];
        const market = new UniswapV2Market(marketAddress, [pair[0], pair[1]]);
        marketPairs.push(market);
      }

      if (pairs.length < this.batchSize) {
        break;
      }
    }

    return marketPairs;
  }
}

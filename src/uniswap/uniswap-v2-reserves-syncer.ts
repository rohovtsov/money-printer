import { BigNumber, Contract, providers } from 'ethers';
import { UniswapV2Market } from './uniswap-v2-market';
import { UNISWAP_LOOKUP_CONTRACT_ADDRESS, UNISWAP_QUERY_ABI } from '../entities';



export class UniswapV2ReservesSyncer {
  constructor(
    readonly provider: providers.JsonRpcProvider,
  ) { }

  async syncReserves(markets: UniswapV2Market[]): Promise<void> {
    const uniswapQuery = new Contract(UNISWAP_LOOKUP_CONTRACT_ADDRESS, UNISWAP_QUERY_ABI, this.provider);
    const pairAddresses = markets.map(marketPair => marketPair.marketAddress);

    const reserves: Array<Array<BigNumber>> = (await uniswapQuery.functions.getReservesByPairs(pairAddresses))[0];

    for (let i = 0; i < markets.length; i++) {
      const marketPair = markets[i];
      const reserve = reserves[i]
      marketPair.setTokenReserves(reserve[0], reserve[1]);
    }
  }
}

import { providers } from 'ethers';
import { ArbitrageStrategy, EthMarket } from './entities';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV2Market } from './uniswap/uniswap-v2-market';

export class ArbitrageRunner {
  private uniswapV2Markets: UniswapV2Market[];
  private uniswapV2ReservesSyncer: UniswapV2ReservesSyncer;

  constructor(
    readonly markets: EthMarket[],
    readonly strategies: ArbitrageStrategy[],
    readonly provider: providers.JsonRpcProvider,
  ) {
    this.uniswapV2ReservesSyncer = new UniswapV2ReservesSyncer(this.provider);
    this.uniswapV2Markets = this.markets.filter(market => market.protocol === 'uniswapV2') as UniswapV2Market[];
  }

  start() {
    //TODO: May be executed in an incorrect order. Use switchMap here.
    this.provider.on('block', async (blockNumber) => {
      await this.uniswapV2ReservesSyncer.syncReserves(this.uniswapV2Markets);

      this.strategies.map(strategy => {
        const opportunities = strategy.getArbitrageOpportunities(this.markets, this.markets);
        console.log(opportunities);
      });
    });
  }
}

import { providers } from 'ethers';
import { Address, ArbitrageStrategy, EthMarket, UNISWAP_SYNC_EVENT_TOPIC } from './entities';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV2Market } from './uniswap/uniswap-v2-market';



export class ArbitrageRunner {
  readonly marketsByAddress: Record<Address, EthMarket>;
  readonly uniswapV2Markets: UniswapV2Market[];
  readonly uniswapV2ReservesSyncer: UniswapV2ReservesSyncer;

  constructor(
    readonly markets: EthMarket[],
    readonly strategies: ArbitrageStrategy[],
    readonly provider: providers.JsonRpcProvider,
  ) {
    this.uniswapV2ReservesSyncer = new UniswapV2ReservesSyncer(this.provider);
    this.uniswapV2Markets = this.markets.filter(market => market.protocol === 'uniswapV2') as UniswapV2Market[];
    this.marketsByAddress = this.markets.reduce((acc, market) => {
      acc[market.marketAddress] = market;
      return acc;
    }, {} as Record<Address, EthMarket>)
  }

  start() {
    //TODO: May be executed in an incorrect order. Use switchMap here.
    this.provider.on('block', async (blockNumber) => {
      const changedMarkets = await loadChangedEthMarkets(this.provider, blockNumber, this.marketsByAddress);
      await this.uniswapV2ReservesSyncer.syncReserves(this.uniswapV2Markets);

      this.strategies.map(strategy => {
        const opportunities = strategy.getArbitrageOpportunities(changedMarkets, this.markets);
        console.log(opportunities);
      });
    });
  }
}


function loadChangedEthMarkets(
  provider: providers.JsonRpcProvider, blockNumber: number, marketsByAddress: Record<Address, EthMarket>
): Promise<EthMarket[]> {
  return provider.getLogs({
    fromBlock: blockNumber,
    toBlock: blockNumber,
  }).then(logs => {
    const uniswapV2SyncLogs = logs.filter(log => log.topics.includes(UNISWAP_SYNC_EVENT_TOPIC));
    const changedAddresses = uniswapV2SyncLogs.map(log => log.address);

    return changedAddresses.reduce((acc, address) => {
      if (marketsByAddress[address]) {
        acc.push(marketsByAddress[address]);
      }
      return acc;
    }, [] as EthMarket[]);
  });
}

import { Contract, providers } from 'ethers';
import {
  ALCHEMY_API_KEY,
  ETHER,
  EthMarket,
  EthMarketFactory,
  getLastBlockNumber,
  groupEthMarkets,
  INFURA_API_KEY,
  MONEY_PRINTER_QUERY_ABI,
  MONEY_PRINTER_QUERY_ADDRESS,
  NETWORK,
  sleep,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESSES,
  WETH_ADDRESS,
} from '../src/entities';
import { UniswapV2MarketFactory } from '../src/uniswap/uniswap-v2-market-factory';
import { UniswapV3MarketFactory } from '../src/uniswap/uniswap-v3-market-factory';
import { UniswapV3PreSyncer } from '../src/uniswap/uniswap-v3-pre-syncer';
import { UniswapV3PoolStateSyncer } from '../src/uniswap/uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from '../src/uniswap/uniswap-v3-market';
import { ArbitrageRunner } from '../src/arbitrage-runner';
import { TriangleArbitrageStrategy } from '../src/triangle/triangle-arbitrage-strategy';
import { UniswapV2ArbitrageStrategy } from '../src/triangle/uniswap-v2-arbitrage-strategy';
import { UniswapV2ReservesSyncer } from '../src/uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3PoolStateSyncerContractQuery } from '../src/uniswap/uniswap-v3-pool-state-syncer-contract-query';
import { take, tap } from 'rxjs';

const PROVIDERS = [
  new providers.AlchemyWebSocketProvider(NETWORK, ALCHEMY_API_KEY),
  new providers.AlchemyProvider(NETWORK, ALCHEMY_API_KEY),
  new providers.InfuraWebSocketProvider(NETWORK, INFURA_API_KEY),
  new providers.InfuraProvider(NETWORK, INFURA_API_KEY),
  new providers.WebSocketProvider('ws://127.0.0.1:8546', NETWORK),
  new providers.WebSocketProvider(
    'wss://delicate-dry-bird.quiknode.pro/96b5edcc4135f9c06a1e1b4499d6808bc20a0539/',
    NETWORK,
  ),
];

async function testSpeed() {
  const test = [
    [PROVIDERS[0], 'WS Alchemy'],
    [PROVIDERS[1], 'Alchemy'],
    [PROVIDERS[2], 'WS Infura'],
    [PROVIDERS[3], 'Infura'],
    [PROVIDERS[4], 'Local'],
    [PROVIDERS[5], 'WS QuickNode'],
  ];

  const blocks: Record<string, any[]> = {};
  const timestamps: Record<string, any> = {};

  for (const item of test) {
    (item[0] as any).on('block', (num: number) => {
      const arr = blocks[String(num)] ?? (blocks[String(num)] = []);
      const now = Date.now();

      if (!timestamps[String(num)]) {
        timestamps[String(num)] = now;
      }

      const first = timestamps[String(num)];
      arr.push([item[1], now - first]);

      console.log(blocks);
    });
  }
}

async function testSpeed2() {
  const test = [
    [PROVIDERS[0], 'WS Alchemy'],
    [PROVIDERS[1], 'Alchemy'],
    [PROVIDERS[2], 'WS Infura'],
    [PROVIDERS[3], 'Infura'],
    [PROVIDERS[4], 'Local'],
    [PROVIDERS[5], 'WS QuickNode'],
  ];

  const blocks: Record<string, any[]> = {};

  async function testFunc(contract: any): Promise<number[]> {
    const now = Date.now();
    const result = await contract.functions.getStatesForPools(
      ['0x8dB1b906d47dFc1D84A87fc49bd0522e285b98b9', '0x735a26a57A0A0069dfABd41595A970faF5E1ee8b'],
      [100, 2],
    );
    //await contract.callStatic.decimals();
    return [Date.now() - now];
  }

  (PROVIDERS[4] as any).on('block', (num: number) => {
    for (const item of test) {
      //const contract = new Contract(WETH_ADDRESS, ERC20_ABI, item[0] as any);
      const contract = new Contract(
        MONEY_PRINTER_QUERY_ADDRESS,
        MONEY_PRINTER_QUERY_ABI,
        item[0] as any,
      );

      const arr = blocks[String(num)] ?? (blocks[String(num)] = []);

      testFunc(contract).then((r) => {
        arr.push([item[1], ...r]);
      });
    }

    console.log(blocks);
  });
}

describe('Speed test', function () {
  this.timeout(1000000);

  it('Test new block speed', function () {
    testSpeed();
  });

  it('Test contract execution speed', function () {
    testSpeed2();
  });

  it('Test e2e from block receive to full sync', async function () {
    const testProvider = PROVIDERS[0];
    const providersWithNames = [
      /*[PROVIDERS[0], 'WS Alchemy'],*/
      /*[PROVIDERS[2], 'WS Infura'],
      [PROVIDERS[4], 'Local'],*/
      [PROVIDERS[5], 'WS QuickNode'],
    ];
    const LAST_BLOCK = await getLastBlockNumber(testProvider);
    const factories: EthMarketFactory[] = [
      ...UNISWAP_V2_FACTORY_ADDRESSES.map(
        (address) => new UniswapV2MarketFactory(testProvider, address, LAST_BLOCK),
      ),
      ...UNISWAP_V3_FACTORY_ADDRESSES.map(
        (address) => new UniswapV3MarketFactory(testProvider, address, LAST_BLOCK),
      ),
    ];

    const markets: EthMarket[] = (
      await Promise.all(factories.map((factory) => factory.getEthMarkets()))
    ).reduce((acc, markets) => [...acc, ...markets], []);

    await new UniswapV3PreSyncer(
      new UniswapV3PoolStateSyncer(testProvider, 3),
      markets.filter((market) => market.protocol === 'uniswapV3') as UniswapV3Market[],
      true,
    ).presync();

    console.log(`Loaded markets: ${markets.length}`);

    let blockTimes: Record<number, number> = [];

    for (const item of providersWithNames) {
      const provider = (item as any)[0] as providers.WebSocketProvider;
      const name = (item as any)[1] as string;

      const runner = new ArbitrageRunner(
        markets,
        [],
        new UniswapV2ReservesSyncer(provider, 10, 1000),
        new UniswapV3PoolStateSyncerContractQuery(provider, 10),
        provider,
        [],
      );

      runner.currentBlockNumber$.subscribe((blockNumber) => {
        if (!blockTimes[blockNumber]) {
          blockTimes[blockNumber] = Date.now();
        }
      });

      runner
        .startSync()
        .pipe(
          tap((event) => {
            console.log(
              `${name} Synced ${event.blockNumber} block of ${
                event.changedMarkets.length
              } changed markets in ${Date.now() - blockTimes[event.blockNumber]}ms`,
            );
          }),
        )
        .subscribe();
    }

    return sleep(1000000000);
  });
});

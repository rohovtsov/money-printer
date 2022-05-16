import 'log-timestamp';
import { BigNumber, Contract, providers } from 'ethers';
import {
  concatMap,
  defer,
  EMPTY,
  filter,
  from,
  map,
  merge,
  mergeMap,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ArbitrageBlacklist } from './arbitrage-blacklist';
import { ArbitrageExecutor } from './arbitrage-executor';
import { ArbitrageRunner } from './arbitrage-runner';
import {
  ArbitrageOpportunity,
  BLACKLIST_MARKETS,
  BLACKLIST_TOKENS,
  calcBaseFeePerGas,
  endTime,
  ETHER,
  EthMarket,
  EthMarketFactory,
  FLASHBOTS_RELAY_SIGNING_KEY,
  getBaseFeePerGas,
  getLastBlockNumber,
  getLogsRegressive,
  INFURA_API_KEY,
  mergeLogPacks,
  MIN_PROFIT_NET,
  NETWORK,
  printOpportunity,
  PRIVATE_KEY,
  SimulatedArbitrageOpportunity,
  startTime,
  UNISWAP_POOL_BURN_EVENT_TOPIC,
  UNISWAP_POOL_MINT_EVENT_TOPIC,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESSES,
  UNISWAP_V3_POOL_ABI,
  UNISWAP_V3_QUOTER_ABI,
  UNISWAP_V3_QUOTER_ADDRESS,
  USE_FLASHBOTS,
  WETH_ADDRESS,
} from './entities';
import { FlashbotsTransactionSender } from './sender/flashbots-transaction-sender';
import { Web3TransactionSender } from './sender/web3-transaction-sender';
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import { UniswapV3PoolStateSyncerContractQuery } from './uniswap/uniswap-v3-pool-state-syncer-contract-query';
import { UniswapV2ArbitrageStrategy } from './triangle/uniswap-v2-arbitrage-strategy';
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { util } from 'prettier';

const PROVIDERS = [
  new providers.AlchemyWebSocketProvider(NETWORK, `a0SpOFIBbxj6-0h4q8PyDjF1xKIqScxB`),
  new providers.AlchemyProvider(NETWORK, 'a0SpOFIBbxj6-0h4q8PyDjF1xKIqScxB'),
  new providers.InfuraWebSocketProvider(NETWORK, INFURA_API_KEY),
  new providers.InfuraProvider(NETWORK, INFURA_API_KEY),
];
const provider = PROVIDERS[0];
const wssProvider = PROVIDERS[0] as providers.WebSocketProvider;

async function testSpeed() {
  const test = [
    [PROVIDERS[0], 'WS Alchemy'],
    [PROVIDERS[1], 'Alchemy'],
    [PROVIDERS[2], 'WS Infura'],
    [PROVIDERS[3], 'Infura'],
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

async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  //12370000 = 9 marketsV3
  //12369800 = 2 marketsV3

  console.log(`Launching on ${NETWORK} ${USE_FLASHBOTS ? 'using flashbots ' : ''}...`);

  const sender = USE_FLASHBOTS
    ? await FlashbotsTransactionSender.create(provider, NETWORK, FLASHBOTS_RELAY_SIGNING_KEY)
    : new Web3TransactionSender(provider, 2);

  const LAST_BLOCK = await getLastBlockNumber(provider);
  const factories: EthMarketFactory[] = [
    ...UNISWAP_V2_FACTORY_ADDRESSES.map(
      (address) => new UniswapV2MarketFactory(provider, address, LAST_BLOCK),
    ),
    ...UNISWAP_V3_FACTORY_ADDRESSES.map(
      (address) => new UniswapV3MarketFactory(provider, address, LAST_BLOCK),
    ),
  ];

  const markets: EthMarket[] = (
    await Promise.all(factories.map((factory) => factory.getEthMarkets()))
  ).reduce((acc, markets) => [...acc, ...markets], []);

  console.log(`Loaded markets: ${markets.length}`);

  const blacklist = new ArbitrageBlacklist(BLACKLIST_MARKETS, BLACKLIST_TOKENS);
  const executor = new ArbitrageExecutor(sender, provider, PRIVATE_KEY);
  const allowedMarkets = blacklist.filterMarkets(markets);

  const syncerV3 = new UniswapV3PoolStateSyncer(provider, 3);
  let marketsV3 = markets.filter((market) => market.protocol === 'uniswapV3') as UniswapV3Market[];
  startTime('presyncV3');
  console.log(`Pre-Sync v3 markets: ${marketsV3.length} ...`);
  await syncerV3.syncPoolStates(marketsV3, 0);
  console.log(`Pre-Sync v3 markets: ${marketsV3.length} finished in ${endTime('presyncV3')}ms`);

  const runner = new ArbitrageRunner(
    allowedMarkets,
    [
      new TriangleArbitrageStrategy(
        {
          [WETH_ADDRESS]: [ETHER * 13n], //, ETHER.mul(10), ETHER]
        },
        allowedMarkets,
      ),
      new UniswapV2ArbitrageStrategy({ startAddresses: [WETH_ADDRESS] }, allowedMarkets),
    ],
    new UniswapV2ReservesSyncer(provider, 10, 1000),
    new UniswapV3PoolStateSyncerContractQuery(provider, 10),
    provider,
    wssProvider,
  );

  /*marketsV3 = markets as UniswapV3Market[];
  const syncer = new UniswapV3PoolStateSyncer(provider, 10);
  await syncer.syncPoolStates(marketsV3);

  marketsV3 = marketsV3
    .sort((a, b) => {
      const countA = a?.pool?.advancedTicks?.length ?? 0;
      const countB = b?.pool?.advancedTicks?.length ?? 0;
      return countA - countB;
    })
    .slice(0, markets.length);

  startTime();
  await syncer.syncPoolStates(marketsV3);
  console.log(`GRAPH TIME`, endTime());*/

  /*
  console.log(market1.calcTokensOut('sell', ETHER.mul(10000000))?.toString());
  console.log(market1.calcTokensOut('sell', ETHER.mul(10000000))?.toString());
  market1.setPoolState(
    market1?.pool?.tickCurrent ?? 0,
    BigNumber.from(market1?.pool?.sqrtRatioX96?.toString()),
    BigNumber.from(market1?.pool?.liquidity?.toString()),
    tickets2
  );
  console.log(market1.calcTokensOut('sell', ETHER.mul(10000000))?.toString());
  console.log(market1.calcTokensOut('sell', ETHER.mul(10000000))?.toString());
  console.log(tickets1.length, 'vs', tickets2.length);*/

  /*const ticksMap1 = marketsV3.reduce((acc, market) => {
    acc[market.marketAddress] = (market?.pool?.ticks ?? []).reduce((acc0, tick) => {
      acc0.push({
        index: tick.index,
        liquidityNet: tick.liquidityNet.toString(),
      });
      return acc0;
    }, [] as { index: number, liquidityNet: string }[]);
    return acc;
  }, {} as Record<string, { index: number, liquidityNet: string }[]>);

  let ticksChecksum1 = marketsV3.reduce(
    (acc, market) => {
      const count = market?.pool?.ticks?.length ?? 0;
      acc.sum += (market?.pool?.ticks ?? []).reduce(
        (acc0, m) => acc0 + BigInt(m.liquidityNet),
        0n
      );
      acc.count += count;
      return acc;
    },
    { sum: 0n, count: 0 },
  );

/!*  marketsV3.forEach(market => {
    if (market?.pool?.advancedTicks?.length) {
      market!.pool!.advancedTicks = Array.from({ length: market?.pool?.advancedTicks?.length }) as any[];
    }
  });*!/

  const syncer1 = new UniswapV3PoolStateSyncerContractQuery(PROVIDERS[0], 10);
  const syncer2 = new UniswapV3PoolStateSyncerContractQuery(PROVIDERS[1], 10);
  const syncer3 = new UniswapV3PoolStateSyncerContractQuery(PROVIDERS[2], 10);
  const syncer4 = new UniswapV3PoolStateSyncerContractQuery(PROVIDERS[3], 10);

  const onlyMarkets = [
    "0xe2680fd7CdBb04E9087a647Ad4D023EF6C8fb4e2",
    "0x5eC38a0E8616b9FaAAC92ECb163E5918c0097D7E",
    "0x188C785ADB5a5f125697675e6888F86cda19e4a0",
    "0x8fE536c7dC019455cce34746755C64bBE2Aa163b",
    "0xdB4455c4BAE0e91FD11D10aC079c704E5B2AF0B5",
    "0xd54cdf75fc4f492BC00558183d41136B3F9De7b1",
    "0x055752b419Ab27b5Fd53258cd411d607eBFaa67F",
    "0x3e9130133D61E948BAa0177ebAaF30D3E5AE86E0",
    "0x87fBC54c64524dCF015BeA3477b5CD9911bD3780",
    "0x8F896Ad97D65d176D91BF02765c3FD5f71f36CC8",
    "0xEEeEeC6a0D70b0DDDDa004cF5eb1c2bd72Ea0e71",
    "0x9275E26bfb23B18bebB07BFF45e85110F60963E9",
    "0xF87d3F979d2FbE547131BEFcF700D64FF174A9B9",
    "0x19142119aBfa4c697C12222CbDa786496f38BbAD",
    "0x415821723747B1b2f804C1bd68354f35ab4d8B69",
    "0x5E68D26F6842EC80538A1808F1552c58BCaA660b",
    "0xE5E2989Dc53B80cc3BB7C35951e650f0671A8843",
    "0x116A81DC663b4674fF46FdfD406276a46B128cc7",
    "0x0BeFa4499Df65951407BBe9B60A217b13017160d",
    "0xeC2061372a02D5e416F5D8905eea64Cab2c10970",
    "0xF7957307b38f15665326Ed518244e2bB6838f6DC",
    "0xAfC93aEeeb791264F3a22a6dd6Dba781DE2b59cd",
    "0x02c6E04e12137B8279467796D9BC7dDcc01e6A35",
    "0x69f4EA8F9DE06dbD55251C34cCa79e0e66cD0d81",
    "0xd51d8844edb3F1ad17a0B738a4EaD26Ec101E764",
    "0xeE3E92f0eCEb32B429caaad4cA72F7B54D5b78eE",
    "0xBc03e9A0669a5E7b8FEe1574f272C844790ed8F4",
    "0xdb83996cc031D7CE55fd9bb6B2be9e6684C15B1e",
    "0x6A40eD55a070b694b60D6B6e1129e50B78967F30",
    "0x962A2435849D9bB8bF6a38286f922BC2F3EA7878",
    "0x39d9f90baA78287b0F0B1d875D15920A93308445",
    "0x11ABC48E8AB5dF0212Fa3e0D05443a3E37c70F07",
    "0x463C17C98D1DAEC1dFFddE9DeC05415051a7Ef27",
    "0x807EEA5642afCEA3212e5F07dfFFC574B083055e",
    "0xA2D2bc49943fD6ae5C9D59C70D9E7DdfB08267b6",
    "0x7c978CBbFBc6Bf7971780C15eFD8e5B8F0Bec423",
    "0xCBE3F089cf4BF0acEDC0643a9A0647a59b015A03",
    "0x37E9A658745303E8194710736906f56F0a0Ca61c",
    "0x2b1A1b9D6A50D225C84d1AE3624D3396E0B245e8",
    "0xdD1F66D14d1c7e114B2Cf06DA92430e92D14334F",
    "0xc2D80b4753f163A11d0C3baFDd25686F19f8940a",
    "0xFE3b5Aba4b4BBb09E98097E1971936FcA6a6496C",
    "0x735a26a57A0A0069dfABd41595A970faF5E1ee8b",
    "0x40beB52E1138eb7C5f6391C139685829edb1EBA9",
    "0xdABcEF68bB3dEe6bB380E35b6e9034245949CC5B",
    "0x622d5e137437A46c037e1b638e1a1da351b0e039",
    "0x88efd7A4E57d160ab03Cc538Aa054fEe3AA2080C",
    "0x8C6D3a5374aa788A6Fa885f5e77F58D80c20dedf",
    "0xA84BfB47fD0b793EE11749e8282B21855F49944F",
    "0xb52BE94539F5c7C48604C21A3Ed006bA9850e3ec",
    "0x98eb3887B6c2CD50341aF13E26BA5111Ec585c57",
    "0xAFB9674BB93F762a651570c78C0D2113B0786981",
    "0xAE68fF76cc66B70d5590266067Cf2e964bC61810",
    "0xA6b2e8cbb93Df20D99437622d50EAfE687d0E3Bd",
    "0x0BDDd19CEc6b6E614B7B8BfF380cE830D9b85Ba6",
    "0x22fa659788F8875D4749B8A339D8a91BE2a33e64",
    "0x6A0cC48D488a720b12727fe9593c51EddA9e7409",
    "0x5c4f01b21011d2ed4D76a98b8ff69540d262acE6",
    "0xEb9609Fa6846d028B80140Edc16DB4D911562c1e",
    "0xC7136b5d0B6c5c0bE466795a57A8A646Ec9e37aB",
    "0x12C74661863D38fA78A26aB7565d258A2b064732",
    "0x2dEdB12729EaC3f98C5E21b98E37d1989A087266",
    "0x2E00201e1745b6d0Dc541B78811AaB5fFF1Fbd3c",
    "0x6715446fea6719B51ED1BBF3796D268c7F5d0ab3",
    "0x1D97fF4e4BBB5EeA7C54572C215AaE484ffd76A7",
    "0x09b9D05754598766873c665280B237c0cd4D9C95",
    "0xABdB92FFc9711Ac6b1B1eD9585311818712e5c0A",
    "0xED936A8e83F74030f9739FC96c94370D84CdD740",
    "0x3062648a7e630c75e16AEE4519242f97bbCB838A",
    "0x9b8ca1fd22928f165530E687b2A1D9C3d4780B2D",
    "0xAf5862Dae3f31A1E2822c7a745eA888533043B10",
    "0xD33603e96f50E5FF952E08feD7f2336737c2226b",
    "0x76E2E5cA226Df1c247C213105a8468427FCBC89F",
    "0x9F68f80C210831a6B87Ab9633e158FD99C326660",
    "0x2bc477c7C00511eC8a2EA667dD8210AF9FF15e1D",
    "0x1C5c60bEf00C820274d4938A5e6d04b124D4910B",
    "0x09b844d25FCF495E2b9bbA39EE2263CCa78242dC",
    "0xE01581f33CFbba98d41C5F09b5A0A262d32798b0",
    "0x5d3b9b60b7C9eE16596A09472Eeff3c57De58318",
    "0x3D2990F9EfdAE5324F6995dAFa2A8cE7A87A79BF",
    "0x12e35Ae493556a10482050a3B409298E85848413",
    "0x85795ba2CE7145146847194a30e9fdf3CF0d560e",
    "0xc33FfE2bA1628C0436Fa33Fea2BD9a356547a911",
    "0x1A250DFC8C3687D0DD082065C471FF0Ddb784FE0",
    "0x29F0096512B4af1d689c1a11A867A6e707a8DcDe",
    "0x680063F1fDC795f08e730416352275b9B2832256",
    "0x5f63246fEe9Ea62A525561988ba2D6182bd632C7",
    "0x8eC264c985A838c038f1a56B796dE71498430af1",
    "0x13Ec351799a349DC50ea7d988256e1CE547471F0",
    "0xa15F69BdD64E4217c1FEe047116a0c60a7A59beF",
    "0xA9d1c63958e4922d2f4192B89D4039Dd5653772C",
    "0x8bf28AF2878E4C38dD8Bca827180B7019f1F926B",
    "0x486263AA56d1B49D78dEa765754164b880c99954",
    "0x1a349A3397a8431eEd8d94A05f88F9001117fcAa",
    "0xC8DC92Dc7C20380bB2Ed7AD06cE578E4d39DfA75",
    "0x3fFedCDDD268511acC44aE67845bdd56c8417fA4",
    "0x75BFF91Af9878F5eC3FEDE9b52D51159afc2430A",
    "0x458578c022eb54ABd4f7e9919997189b25692312",
    "0x1D64947fF4cECB87A3C4aAe6e668f9d312fA71B3",
    "0x9e081BEE26B5A65fA2B811cA31F816C19B56B4D2",
    "0x559f11e7481690eafE71931ff8DAf36dA93Ed91F",
    "0x87b10e431b152c766faCf2907c57B1Dc527f6012",
    "0xE656025Af8922B79F41cc21a2310D46375A51015",
    "0x198BE6bCaA573FD83478e40548d5Ddf24aDBc12e",
    "0xBdbF88846DCF652c48370496001A3AFC79b5d414",
    "0xfebBf3B675B2c1390a79c2A9fD0c8E05A4Dc287b",
    "0x97D44a702880Be1732E1E61404e610968E2b42Cc",
    "0x4f1fEED9A33e6125D3B394C5821C5e9D7DfB7134",
    "0x7FfB95d27152D79Aba7a74C7737822525feAAfD1",
    "0x930b2c8Ff1de619d4D6594DA0Ba03fdEDA09a672",
    "0xE5ac03619dcd34222cE60F9789BE355FAeb9c0D3",
    "0x016d7096a73bf466f444f286E704D81D09BabEc2",
    "0x9f733005f4B54dfA3991b94c7c227F10296fcA75",
    "0xc9F62E76d84F196352785cdC998425FCd21AE21d",
    "0x161563973d6B1E1c299340A01e71353a04770b6e",
    "0xeA32DAD112dd9C84fE109AbfeF510f92826436Df",
    "0x51C2841333fbBAb53B7c2c442CC265BF16430d6D",
    "0x750889024Ad738125a55c0F25b3a1D4A30475F71",
    "0x8234B415b59FDf123fc987660D26bB4F8E17D906",
    "0xB34395AA0a2d21c5D6A5db5cbbE2e157C27D545a"
  ];

  startTime();
  await syncer1.syncPoolStates(marketsV3);
  console.log(`CONTRACT TIME`, endTime());
  /!*await syncer2.syncPoolStates(marketsV3);
  console.log(`CONTRACT TIME`, endTime());
  await syncer3.syncPoolStates(marketsV3);
  console.log(`CONTRACT TIME`, endTime());
  await syncer4.syncPoolStates(marketsV3);
  console.log(`CONTRACT TIME`, endTime());*!/

  let ticksChecksum2 = marketsV3.reduce(
    (acc, market) => {
      const count = market?.pool?.ticks?.length ?? 0;
      acc.sum += (market?.pool?.ticks ?? []).reduce(
        (acc0, m) => acc0 + BigInt(m.liquidityNet),
        0n
      );
      acc.count += count;
      return acc;
    },
    { sum: 0n, count: 0 },
  );

  const ticksMap2 = marketsV3.reduce((acc, market) => {
    acc[market.marketAddress] = (market?.pool?.ticks ?? []).reduce((acc0, tick) => {
      acc0.push({
        index: tick.index,
        liquidityNet: tick.liquidityNet.toString(),
      });
      return acc0;
    }, [] as { index: number, liquidityNet: string }[]);
    return acc;
  }, {} as Record<string, { index: number, liquidityNet: string }[]>);

  console.log(ticksChecksum1);
  console.log(ticksChecksum2);

  for (const address in ticksMap1) {
    if (ticksMap1[address].length !== ticksMap2[address].length) {
      console.log(address);
      console.log(ticksMap1[address].length);
      console.log(ticksMap2[address].length);
      fs.writeFileSync('1.json', JSON.stringify(ticksMap1[address], null, 2));
      fs.writeFileSync('2.json', JSON.stringify(ticksMap2[address], null, 2));
      continue;
    }

    for (let i = 0; i < ticksMap1[address].length; i++) {
      if (
        ticksMap1[address][i].index !== ticksMap2[address][i].index ||
        ticksMap1[address][i].liquidityNet !== ticksMap2[address][i].liquidityNet
      ) {
        console.log(address);
        console.log(ticksMap1[address]);
        console.log(ticksMap2[address]);
        break;
      }
    }
  }

  let market = marketsV3[marketsV3.length - 1];
  let ticks = market?.pool?.ticks ?? [];
  let tick = market?.pool?.tickCurrent ?? 0;
  let sqrtRatioX96 = BigInt(market?.pool?.sqrtRatioX96?.toString() ?? 0n);
  let liquidity = BigInt(market?.pool?.liquidity?.toString() ?? 0n);
  let result: bigint | null;
  let amount = ETHER * 10000000n;

  ticks = ticks.sort((a, b) => a.index - b.index);
  market.setPoolState(tick, sqrtRatioX96, liquidity, ticks);
  result = market.calcTokensOut('sell', amount);
  console.log('Subgraph:', result?.toString());

  market.setPoolState(
    tick,
    sqrtRatioX96,
    liquidity,
    ticks.filter((tick) => tick.liquidityNet !== 0n),
  );
  result = market.calcTokensOut('sell', amount);
  console.log('Non zero:', result?.toString());

  market.setPoolState(tick, sqrtRatioX96, liquidity, ticks);
  result = market.calcTokensOut('sell', amount);
  console.log('Subgraph:', result?.toString());

  market.setPoolState(
    tick,
    sqrtRatioX96,
    liquidity,
    ticks.filter((tick) => tick.liquidityNet !== 0n),
  );
  result = market.calcTokensOut('sell', amount);
  console.log('Non zero:', result?.toString());

  const quoter = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
  console.log(
    `Quoter  :`,
    (
      await quoter.callStatic
        .quoteExactInputSingle(market.tokens[0], market.tokens[1], market.fee, amount.toString(), 0)
        .catch(() => null)
    )?.toString(),
  );*/

  //const lastMarket = marketsV3[marketsV3.length - 1];

  /*await syncer.syncPoolStates(marketsV3, 0);
  let totalTicksCount = 0;
  const map: Record<string, number> = marketsV3.reduce((acc, market) => {
    const count = market?.pool?.advancedTicks?.length ?? 0;
    totalTicksCount += count;
    acc[count.toString()] = (acc[count.toString()] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(map);
  //14772918 = 118880
  //14772953 = 118882
  //14773032 = 118886
  //14773045 = 118888
  console.log(totalTicksCount);
  console.log(await getLastBlockNumber(provider));

  const biggest = marketsV3.reduce((acc, market) => {
    if (!acc) {
      return market;
    }

    if ((acc?.pool?.advancedTicks?.length ?? 0) < (market?.pool?.advancedTicks?.length ?? 0)) {
      return market;
    }

    return acc;
  }, null as UniswapV3Market | null) as UniswapV3Market;

  //const biggestContract = new Contract(biggest.marketAddress, UNISWAP_V3_POOL_ABI, provider);
  const biggestTicks = biggest?.pool?.advancedTicks ?? [];
  const biggestTicksSpacingSet = new Set<number>();
  biggestTicks.forEach(tick => {
    biggestTicksSpacingSet.add(tick.index);
  });
  const biggestTicksSpacing = Array.from(biggestTicksSpacingSet);
  console.log(biggestTicksSpacing);

  const abi = JSON.parse(fs.readFileSync('./artifacts/contracts/MoneyPrinterQuery.sol/MoneyPrinterQuery.json').toString()).abi;
  const address = '0xB54AC38D373555FC9450a2Ca311Ea810B726cB57';
  const queryContract = new Contract(address, abi, provider);

  async function getTicks(address: string): Promise<Tick[]> {
    const outputContract = (await queryContract.functions.getTicksForPool(address, 5000))[0] as any[];
    return outputContract.map(item => {
      return new Tick({
        index: item[0].toNumber(),
        liquidityGross: JSBI.BigInt(0),
        liquidityNet: JSBI.BigInt(item[1].toString())
      });
    })
  }

  async function requestStates(addresses: string[], bufferSize: number): Promise<void> {
    startTime('requestStates');

    const outputContract = (await queryContract.functions.getStatesForPools(addresses, bufferSize))[0] as any[];

    for (const res of outputContract) {
      console.log(res.ticks.length);
    }

    console.log(`States ${addresses.length} requested in ${endTime('requestStates')}ms`);
  }

  const biggestTicks2 = await getTicks(biggest.marketAddress);
  console.log(biggestTicks2);
  console.log(biggestTicks.length);
  console.log(biggestTicks2.length);

  const biggestTicksNonZero = biggestTicks.filter(tick => JSBI.greaterThan(tick.liquidityNet, JSBI.BigInt(0)));
  const biggestTicks2NonZero = biggestTicks2.filter(tick => JSBI.greaterThan(tick.liquidityNet, JSBI.BigInt(0)));
  console.log(biggestTicksNonZero.length);
  console.log(biggestTicks2NonZero.length);

  const requestCount = 2;
  const requestAddresses = Array.from({ length: requestCount }).map(() => biggest.marketAddress);
  await requestStates(requestAddresses, 1200);
  */

  const thisBlock$ = runner.currentBlockNumber$;
  const concurrentSimulationCount = 20;
  const simulatedOpportunities$ = runner.start().pipe(
    switchMap((event) => {
      const trash = event.opportunities;
      const opportunities = event.opportunities.filter((op) => op.profit > MIN_PROFIT_NET);
      console.log(
        `Found trash opportunities: ${trash.length} in ${endTime('render')}ms at ${
          event.blockNumber
        }\n`,
      );
      console.log(`Found opportunities: ${opportunities.length} at ${event.blockNumber}\n`);

      return from(
        opportunities.map((op) => [op, event.baseFeePerGas] as [ArbitrageOpportunity, bigint]),
      );
    }),
    mergeMap(([opportunity, baseFeePerGas]) => {
      return thisBlock$.pipe(
        //TODO: add timeout 60 sec for simulation
        concatMap((blockNumber) => {
          if (blockNumber > opportunity.blockNumber) {
            //если блок уже неактуальный, откладываем все до лучших времен.
            console.log(
              `Simulation postponed. Old block ${opportunity.blockNumber} / ${blockNumber}`,
            );
            runner.queueOpportunity(opportunity);
            return EMPTY;
          }

          console.log(`Simulation started. On ${blockNumber}`);

          return defer(() => executor.simulateOpportunity(opportunity, baseFeePerGas)).pipe(
            catchError((err: any) => {
              //если отвалилось иза-за неправильного газа, проверим на след. блоке
              if (err?.queue) {
                runner.queueOpportunity(opportunity);
              }

              //если закончились деньги - погибаем
              if (err?.die) {
                throw new Error('Insufficient funds');
              }

              return EMPTY;
            }),
            tap((opportunity: SimulatedArbitrageOpportunity) => {
              //удачную оппортунити с чистой доходностью > 0, проверим на след блоке
              runner.queueOpportunity(opportunity);
            }),
          );
        }),
      );
    }, concurrentSimulationCount),
  );

  const executedOpportunities$ = simulatedOpportunities$.pipe(
    mergeMap((opportunity) => {
      return thisBlock$.pipe(
        concatMap((blockNumber) => {
          if (blockNumber > opportunity.blockNumber) {
            console.log(
              `Execution postponed. Old block ${opportunity.blockNumber} / ${blockNumber}`,
            );
            //удачную оппортунити с чистой доходностью > 0, проверим на след блоке
            runner.queueOpportunity(opportunity);
            return EMPTY;
          }

          console.log(`Executing opportunity...`);
          printOpportunity(opportunity);
          return defer(() => executor.executeOpportunity(opportunity)).pipe(
            catchError(() => EMPTY),
            map(() => opportunity),
          );
        }),
      );
    }),
  );

  executedOpportunities$.subscribe();
}

main();
//testSpeed();

//16:09:06.934
//16:09:09.54
//16:09:10.63
//16:09:23.211Z

//16:13:21.69
//16:13:24.47
//16:13:26.78
//16:13:27.182Z

//16:16:51.317Z
//16:16:54.257Z
//16:16:54.748
//16:16:55.126Z

//22:17:05.532 - Получили блок
//22:17:07.752 - Получили измененные рынки
//22:17:08.491 - Закончили синхронится
//22:17:08.491 - Changed markets: 109 in 14782544
//22:17:08.494 - Changed triangles 52176
//22:17:09.790 - Changed triangles 22334
//22:17:13.268 - Found opportunities: 71, non-correlating: 71 in 4777ms
//22:17:13.268 - Передали на симуляция
//22:17:13.268 - Передали на симуляция
//22:17:13.902 - Пришла симуляция
//22:17:13.903 - Передали на отправку
//22:17:14.406 - Отправлено
//Итого - 9 сек
//22:17:30.248 - Новый блок (спустя 16 сек)

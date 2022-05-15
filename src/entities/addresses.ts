import { NETWORK } from './environmet';

const UNISWAP_FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const SUSHISWAP_FACTORY_ADDRESS = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac';
const CRO_FACTORY_ADDRESS = '0x9DEB29c9a4c7A88a3C0257393b7f3335338D9A9D';
const ZEUS_FACTORY_ADDRESS = '0xbdda21dd8da31d5bee0c9bb886c044ebb9b8906a';
const LUA_FACTORY_ADDRESS = '0x0388c1e0f210abae597b7de712b9510c6c36c857';

export const UNISWAP_V3_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const UNISWAP_SCAM_V3_FACTORY_ADDRESS = '0x42eb44df87B9170363dE9B09bd39BF9b5F05f231';
const MINTYSWAP_V3_FACTORY_ADDRESS = '0x21bf88d5753f971ADD459b33504cb1B62c2D2719';

export const UNISWAP_V3_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

export const UNISWAP_LOOKUP_CONTRACT_ADDRESS = {
  mainnet: '0x5EF1009b9FCD4fec3094a5564047e190D72Bd511',
  goerli: '0x9A033ae6FA95C2f0570436c8C9a6A59A37ecEd84',
  ropsten: '0xAE634Aa88a3305447F3Af7a2B39851B7b29249c0',
}[NETWORK] as string;

export const WETH_ADDRESS = {
  mainnet: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  goerli: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
  ropsten: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
}[NETWORK] as string;

export const MONEY_PRINTER_ADDRESS = {
  ropsten: '0x18B6EA53FBDBB38d3E3df4E86Bf52E2512EAc619',
  goerli: '0x18B6EA53FBDBB38d3E3df4E86Bf52E2512EAc619',
  mainnet: '0xC49FF8f6bE0Ed002D97FD04b349A405efB1c3A4f',
  //'goerli': '0x51fbc7797B6fD53aFA8Ce0CAbF5a35c60B198837', //last working
}[NETWORK] as string;

export const MONEY_PRINTER_QUERY_ADDRESS = {
  goerli: '0xa338a8ade040538536D6C79BEB4b18eEe0b443B0',
}[NETWORK] as string;

export const UNISWAP_V2_FACTORY_ADDRESSES = {
  mainnet: [
    CRO_FACTORY_ADDRESS,
    ZEUS_FACTORY_ADDRESS,
    LUA_FACTORY_ADDRESS,
    SUSHISWAP_FACTORY_ADDRESS,
    UNISWAP_FACTORY_ADDRESS,
  ],
  goerli: [UNISWAP_FACTORY_ADDRESS],
  ropsten: [UNISWAP_FACTORY_ADDRESS],
}[NETWORK] as string[];

export const UNISWAP_V3_FACTORY_ADDRESSES = {
  mainnet: [
    MINTYSWAP_V3_FACTORY_ADDRESS,
    UNISWAP_SCAM_V3_FACTORY_ADDRESS,
    UNISWAP_V3_FACTORY_ADDRESS,
  ],
  goerli: [UNISWAP_V3_FACTORY_ADDRESS],
  ropsten: [],
}[NETWORK] as string[];

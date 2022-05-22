import * as dotenv from 'dotenv';
dotenv.config();

export const NETWORK = process.env.NETWORK || 'goerli';
//export const INFURA_API_KEY = process.env.INFURA_API_KEY || '08a6fc8910ca460e99dd411ec0286be6';
export const INFURA_API_KEY = process.env.INFURA_API_KEY || '8ac04e84ff9e4fd19db5bfa857b90a92';
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || 'a0SpOFIBbxj6-0h4q8PyDjF1xKIqScxB';
export const PRIVATE_KEY =
  process.env.PRIVATE_KEY || '0xe287672c1f7b7a8a38449626b3303a2ad4430672977b8a6f741a9ca35b6ca10c';
export const MIN_PROFIT_NET = BigInt(String(Number(process.env.MIN_PROFIT_NET ?? 0) * 10 ** 18));

export const USE_FLASHBOTS = (process.env.USE_FLASHBOTS ?? 'true') === 'true';
export const FLASHBOTS_RELAY_HACKED_SIGNING_KEY =
  (process.env.FLASHBOTS_RELAY_HACKED_SIGNING_KEY ?? 'false') === 'true';
export const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY;
export const MINER_REWORD_PERCENT = Number(process.env.MINER_REWORD_PERCENT ?? 50);
export const UNISWAP_V3_GRAPH_ENDPOINT =
  process.env.UNISWAP_V3_GRAPH_ENDPOINT ||
  'https://api.thegraph.com/subgraphs/name/ln-e/uniswap-v3-goerli';

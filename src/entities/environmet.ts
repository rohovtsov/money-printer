import * as dotenv from 'dotenv';
dotenv.config();

export const NETWORK = process.env.NETWORK || 'goerli';
export const INFURA_API_KEY = process.env.INFURA_API_KEY || '8ac04e84ff9e4fd19db5bfa857b90a92';
export const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xe287672c1f7b7a8a38449626b3303a2ad4430672977b8a6f741a9ca35b6ca10c';

export const USE_FLASHBOTS = Boolean(process.env.USE_FLASHBOTS ?? true);
export const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY;
export const MINER_REWORD_PERCENT = Number(process.env.MINER_REWORD_PERCENT ?? 50);

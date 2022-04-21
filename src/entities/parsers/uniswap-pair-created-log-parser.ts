import { Log } from '../logs-requester';
import { UNISWAP_PAIR_CREATED_EVENT_ABI } from '../abi';
const ethParseLog = require('eth-log-parser');
const { toChecksumAddress } = require('ethereum-checksum-address');



export const parsePairCreatedLog = (log: Log): PairCreatedEvent | null => {
  let parsedLog = null;

  try {
    parsedLog = ethParseLog(log, UNISWAP_PAIR_CREATED_EVENT_ABI);
  } catch (ignored) {
    console.error(ignored);
  }

  return parsedLog ? {
    pair: toChecksumAddress(parsedLog.returnValues.pair),
    token0: toChecksumAddress(parsedLog.returnValues.token0),
    token1: toChecksumAddress(parsedLog.returnValues.token1),
  } : null;
};


export interface PairCreatedEvent {
  pair: string;
  token0: string;
  token1: string;
}

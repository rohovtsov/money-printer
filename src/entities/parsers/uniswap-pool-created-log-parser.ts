import { Log } from '../logs-requester';
import { UNISWAP_POOL_CREATED_EVENT_ABI } from '../abi';
import { BigNumber } from 'ethers';
const ethParseLog = require('eth-log-parser');
const { toChecksumAddress } = require('ethereum-checksum-address');



export const parsePoolCreatedLog = (log: Log): PoolCreatedEvent | null => {
  let parsedLog = null;

  try {
    parsedLog = ethParseLog(log, UNISWAP_POOL_CREATED_EVENT_ABI);
  } catch (ignored) {
    console.error(ignored);
  }

  return parsedLog ? {
    pool: toChecksumAddress(parsedLog.returnValues.pool),
    token0: toChecksumAddress(parsedLog.returnValues.token0),
    token1: toChecksumAddress(parsedLog.returnValues.token1),
    tickSpacing: Number(parsedLog.returnValues.tickSpacing),
    fee: Number(parsedLog.returnValues.fee),
  } : null;
};


export interface PoolCreatedEvent {
  pool: string;
  token0: string;
  token1: string;
  fee: number,
  tickSpacing: number,
}

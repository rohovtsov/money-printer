import { expect } from 'chai';
import { ethers } from 'hardhat';
import { MoneyPrinterQuery, UniswapV3PoolMock } from '../typechain-types';

describe('MoneyPrinterQuery', function () {
  let poolMock: UniswapV3PoolMock;
  let query: MoneyPrinterQuery;

  beforeEach(async () => {
    const UniswapV3PoolMock = await ethers.getContractFactory('UniswapV3PoolMock');
    const MoneyPrinterQuery = await ethers.getContractFactory('MoneyPrinterQuery');

    poolMock = (await UniswapV3PoolMock.deploy()) as UniswapV3PoolMock;
    await poolMock.deployed();

    query = (await MoneyPrinterQuery.deploy()) as MoneyPrinterQuery;
    await query.deployed();
  });

  it('deploys a contract', async () => {
    expect(poolMock.address).to.properAddress;
    expect(query.address).to.properAddress;
  });

  it('returns states[]', async function () {
    const requestCount = 5;
    const requestAddresses = Array.from({ length: requestCount }).map(() => poolMock.address);

    const result = await query.functions.getStatesForPools(
      requestAddresses,
      //passing wrong bufferSize
      requestAddresses.map(() => 1),
    );
    const results = (result as any[])[1];
    expect(results.length).equal(requestCount);

    for (const res of results) {
      console.log(res.ticks.length);
    }

    console.log(result[0]);
  });
});

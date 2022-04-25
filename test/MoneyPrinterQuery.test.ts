import { expect } from 'chai';
import { ethers } from 'hardhat';
import { MoneyPrinterQuery, UniswapV3PoolMock, UniswapV3QuoterMock } from '../typechain-types';

describe('MoneyPrinterQuery', function () {
  let quoterMock: UniswapV3QuoterMock;
  let poolMock: UniswapV3PoolMock;
  let query: MoneyPrinterQuery;

  beforeEach(async () => {
    const UniswapV3PoolMock = await ethers.getContractFactory('UniswapV3PoolMock');
    const UniswapV3QuoterMock = await ethers.getContractFactory('UniswapV3QuoterMock');
    const MoneyPrinterQuery = await ethers.getContractFactory('MoneyPrinterQuery');

    quoterMock = await UniswapV3QuoterMock.deploy() as UniswapV3QuoterMock;
    poolMock = await UniswapV3PoolMock.deploy() as UniswapV3PoolMock;
    await quoterMock.deployed();
    await poolMock.deployed();

    query = await MoneyPrinterQuery.deploy(quoterMock.address) as MoneyPrinterQuery;
    await query.deployed();
  })

  it('deploys a contract', async () => {
    expect(quoterMock.address).to.properAddress;
    expect(poolMock.address).to.properAddress;
    expect(query.address).to.properAddress;
  });

  it("returns valid prices[][][]", async function () {
    const poolsCount = 15;
    const pools = Array.from({ length: poolsCount }).map(() => poolMock.address);
    const amounts = [10, 11, 100, 999, '1000', '5000003434230', '1199999999999999999999'];

    const prices = await query.callStatic.getPricesForPools(pools, amounts);
    console.log(await query.functions.getTickBitmapForPool(pools[0], -2, 2));
    console.log(await query.functions.getTicksForPool(pools[0], 5));
    console.log(await query.functions.getStateForPool(pools[0]));

    expect(prices.length).equal(poolsCount);
    for (let i = 0; i < prices.length; i++) {
      expect(prices[i].length).equal(amounts.length);

      for (let j = 0; j < amounts.length; j++) {
        expect(prices[i][j].length).equal(2);
      }
    }
    //console.log(prices);
  });
});

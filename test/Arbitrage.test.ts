import { expect, use } from 'chai';
import { solidity } from 'ethereum-waffle';
import { Arbitrage2, getBestCrossedMarket } from '../src/Arbitrage';
import { WETH_ADDRESS, ETHER } from '../src/entities';
import { UniswappyV2EthPair } from '../src/UniswappyV2EthPair';
import { BigNumber } from 'ethers';

use(solidity);

const MARKET_ADDRESS = '0x0000000000000000000000000000000000000001';
const TOKEN_ADDRESS = '0x000000000000000000000000000000000000000a';
const PROTOCOL_NAME = 'TEST';

describe('Arbitrage', function () {
  let groupedWethMarkets: Array<UniswappyV2EthPair>;
  beforeEach(() => {
    groupedWethMarkets = [
      new UniswappyV2EthPair(MARKET_ADDRESS, [TOKEN_ADDRESS, WETH_ADDRESS], PROTOCOL_NAME),
      new UniswappyV2EthPair(MARKET_ADDRESS, [TOKEN_ADDRESS, WETH_ADDRESS], PROTOCOL_NAME),
    ];
  });

  it('Calculate Crossed Markets', function () {
    groupedWethMarkets[0].setReservesViaOrderedBalances([ETHER, ETHER.mul(2)]);
    groupedWethMarkets[1].setReservesViaOrderedBalances([ETHER, ETHER]);

    const bestCrossedMarket = getBestCrossedMarket([groupedWethMarkets], TOKEN_ADDRESS);
    expect(bestCrossedMarket?.volume).to.equal(BigNumber.from('208333333333333333'));
    expect(bestCrossedMarket?.profit).to.equal(BigNumber.from('0x012be1d487a428ce'));
  });

  it('Calculate markets that do not cross', function () {
    groupedWethMarkets[0].setReservesViaOrderedBalances([ETHER, ETHER]);
    groupedWethMarkets[1].setReservesViaOrderedBalances([ETHER, ETHER]);

    const bestCrossedMarket = getBestCrossedMarket([groupedWethMarkets], TOKEN_ADDRESS);
    expect(bestCrossedMarket?.profit.lt(0)).to.equal(true);
  });
});

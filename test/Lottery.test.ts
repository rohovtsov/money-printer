import { solidity } from 'ethereum-waffle';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { fail } from 'assert';
import { expect, use } from 'chai';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

use(solidity);

import { Lottery, Lottery__factory } from '../typechain-types/index';

let lottery: Lottery;
let signers: SignerWithAddress[];

beforeEach(async () => {
  signers = await ethers.getSigners();

  const LotteryFactory = (await ethers.getContractFactory(
    'Lottery',
    signers[0],
  )) as Lottery__factory;

  lottery = await LotteryFactory.deploy();
});

describe('Lotter Contract', () => {
  it('deploys a contract', async () => {
    const contractAddress = lottery.address;
    // @ts-ignore
    expect(contractAddress).to.properAddress;
  });

  it('allows one account to enter', async () => {
    await lottery.enter({
      value: utils.parseEther('0.02'),
    });

    const players = await lottery.getPlayers();
    expect(players[0]).to.eq(signers[0].address);
    expect(players.length).to.eq(1);
  });

  it('allows multiple accounts to enter', async () => {
    await lottery.enter({
      value: utils.parseEther('0.02'),
    });
    await lottery.connect(signers[1]).enter({
      value: utils.parseEther('0.02'),
    });
    await lottery.connect(signers[2]).enter({
      value: utils.parseEther('0.02'),
    });

    const players = await lottery.getPlayers();
    expect(players[0]).to.eq(signers[0].address);
    expect(players[1]).to.eq(signers[1].address);
    expect(players[2]).to.eq(signers[2].address);
    expect(players.length).to.eq(3);
  });

  it('requires a minimium amount of ether to enter', async () => {
    try {
      await lottery.enter({ value: 0 });

      fail('it should not reach here');
    } catch (err) {
      expect(err);
    }
  });

  it('only manager can call pickWinner', async () => {
    try {
      await lottery.connect(signers[1]).pickWinner();

      fail('it should not reach here');
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it('sends money to the winner and resets the player array', async () => {
    await lottery.enter({ value: utils.parseEther('2') });

    const initialBalance = await signers[0].getBalance();
    await lottery.pickWinner();
    const finalBalance = await signers[0].getBalance();

    const difference = finalBalance.sub(initialBalance);
    console.log(difference.gt(utils.parseEther('2')));
    expect(difference.gt(utils.parseEther('1.8'))).to.equal(true);
  });
});

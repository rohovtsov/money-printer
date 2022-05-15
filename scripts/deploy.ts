// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { NETWORK, WETH_ADDRESS } from '../src/entities';

async function deployMoneyPrinterQuery() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const MoneyPrinterQuery = await ethers.getContractFactory('MoneyPrinterQuery');
  const query = await MoneyPrinterQuery.deploy({ gasPrice: ethers.utils.parseUnits('20', 'gwei') });
  await query.deployed();
  console.log('MoneyPrinterQuery deployed to:', query.address);
}

async function deployMoneyPrinter() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  console.log(`Deploying to ${NETWORK} ...`);
  // We get the contract to deploy
  const EXECUTOR_ADDRESS =
    NETWORK === 'mainnet'
      ? '0xCfF78979C0bF25062ec239376B0dAc2eBECbece6'
      : '0x5e9a214bf9864143e44778F9729B230083388cDB';
  const BundleExecutor = await ethers.getContractFactory('MoneyPrinter');
  const contract = await BundleExecutor.deploy(EXECUTOR_ADDRESS, WETH_ADDRESS, {
    // value: ethers.utils.parseEther('0.1'),
  });
  await contract.deployed();
  console.log('MoneyPrinter deployed to:', contract.address);
}

async function deployFlashBotsUniswapQuery() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const FlashBotsUniswapQuery = await ethers.getContractFactory('FlashBotsUniswapQuery');
  const query = await FlashBotsUniswapQuery.deploy();
  await query.deployed();
  console.log('FlashBotsUniswapQuery deployed to:', query.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deployMoneyPrinterQuery().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

//24:21.744
//24:21.914
//24:30.812
//24:31.421
//24:33.472
//12 секунд

//15:54:06
//15:54:18
//15:54:18.54
//15:54:19.35
//15:54:20.02
//14 секунд

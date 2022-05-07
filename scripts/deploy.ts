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
  const UNISWAP_V3_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
  const MoneyPrinterQuery = await ethers.getContractFactory('MoneyPrinterQuery');
  const query = await MoneyPrinterQuery.deploy(UNISWAP_V3_QUOTER_ADDRESS);
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
  const EXECUTOR_ADDRESS = '0x5e9a214bf9864143e44778F9729B230083388cDB';
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
deployMoneyPrinter().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

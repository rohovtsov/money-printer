import { Address } from './interfaces/eth-market';

export const BLACKLIST_MARKETS: Address[] = [
  '0x8a982c9430c5bA14F3Ecfa4A910704D0ab474D04', //XBASE-EBASE
  '0x50b6071561f068963Bcfe2B341126cd6aCcaFAFb', //Dollars
  '0x582E3DA39948C6339433008703211aD2c13EB2ac', //Dollars
  // '0x6624ECcBb05ab3D491701160815Ae5Cc5FCecD08', // goerli
  // '0xEdfdDAdEa8826255fB1CD3fc166aF74476Ae4BA4',
  // '0x6F37bb4Fe20CB6102C4930339ed9c64854a9a696',
];

export const BLACKLIST_TOKENS: Address[] = [
  '0xAe23757696D64ba3151e321E797cF507c20cfcD0', // goerli p.yield
];

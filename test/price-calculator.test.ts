import { ETHER } from '../src/entities';
import { SdkUniswapV2Calculator, SimpleUniswapV2Calculator } from '../src/uniswap/uniswap-v2-price-calculator';
import { expect } from 'chai';

describe('PriceCalculator', function () {
  let uniswapV2Simple = SimpleUniswapV2Calculator;
  let uniswapV2Sdk = SdkUniswapV2Calculator;

  it('UniswapV2Sdk & UniswapV2Simple - calculate same results', function () {
    const reserves1 = ETHER;
    const reserves2 = ETHER.mul(2);
    const output = ETHER.div(100);
    const input = ETHER.div(20);

    const inputSimple = uniswapV2Simple.getTokensIn(reserves1, reserves2, output);
    const inputSdk = uniswapV2Sdk.getTokensIn(reserves1, reserves2, output);

    const outputSimple = uniswapV2Simple.getTokensOut(reserves1, reserves2, input);
    const outputSdk = uniswapV2Sdk.getTokensOut(reserves1, reserves2, input);

    expect(inputSimple.toString()).to.equal(inputSdk.toString())
    expect(outputSimple.toString()).to.equal(outputSdk.toString())
  });

  it('UniswapV2Simple - buy price', function () {
    const reserves1 = ETHER;
    const reserves2 = ETHER.mul(100);
    const token1 = ETHER.div(0.05);

    //BUY token1, how much is token2 bought?
    const boughtToken2 = uniswapV2Simple.getTokensOut(reserves1, reserves2, token1);
    //SELL token1, how much is token2 sold?
    const soldToken2 = uniswapV2Simple.getTokensOut(reserves1, reserves2, token1);
/*
  buyTokenPrice: ethMarket.getTokensIn(tokenAddress, WETH_ADDRESS, ETHER.div(100)),
  sellTokenPrice: ethMarket.getTokensOut(WETH_ADDRESS, tokenAddress, ETHER.div(100)),
*/
  });
});

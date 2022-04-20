import { ETHER } from '../src/entities';
import { SdkUniswapV2Calculator, SimpleUniswapV2Calculator } from '../src/price-calculator/uniswap-v2';
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
});

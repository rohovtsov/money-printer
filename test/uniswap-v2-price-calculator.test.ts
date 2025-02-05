import { endTime, ETHER, startTime } from '../src/entities';
import {
  NativeUniswapV2Calculator,
  SdkUniswapV2Calculator,
  SimpleUniswapV2Calculator,
} from '../src/uniswap/uniswap-v2-price-calculator';
import { expect } from 'chai';

describe('PriceCalculator', function () {
  let uniswapV2Simple = SimpleUniswapV2Calculator;
  let uniswapV2Sdk = SdkUniswapV2Calculator;
  let native = NativeUniswapV2Calculator;
  this.timeout(5000);

  it('UniswapV2Sdk & UniswapV2Simple - calculate same results', function () {
    const reserves1 = ETHER;
    const reserves2 = ETHER.mul(2);
    const output = ETHER.div(100);
    const input = ETHER.div(20);

    const inputSimple = uniswapV2Simple.getTokensIn(reserves1, reserves2, output);
    const inputSdk = uniswapV2Sdk.getTokensIn(reserves1, reserves2, output);

    const outputSimple = uniswapV2Simple.getTokensOut(reserves1, reserves2, input);
    const outputSdk = uniswapV2Sdk.getTokensOut(reserves1, reserves2, input);

    expect(inputSimple?.toString()).to.equal(inputSdk?.toString());
    expect(outputSimple?.toString()).to.equal(outputSdk?.toString());
  });

  it('UniswapV2Sdk & UniswapV2Simple - give same errors', function () {
    const reserves1 = ETHER;
    const reserves2 = ETHER.mul(2);
    const output = ETHER.mul(100);
    const input = ETHER.mul(20);

    const inputSimple = uniswapV2Simple.getTokensIn(reserves1, reserves2, output);
    const inputSdk = uniswapV2Sdk.getTokensIn(reserves1, reserves2, output);

    const outputSimple = uniswapV2Simple.getTokensOut(reserves1, reserves2, input);
    const outputSdk = uniswapV2Sdk.getTokensOut(reserves1, reserves2, input);

    expect(inputSimple?.toString()).to.equal(inputSdk?.toString());
    expect(outputSimple?.toString()).to.equal(outputSdk?.toString());
  });

  it('UniswapV2Sdk & Native - calculate same results', function () {
    const reserves1 = ETHER;
    const reserves2 = ETHER.mul(2);
    const output = ETHER.mul(100);
    const input = ETHER.mul(20);

    const inputSimple = native.getTokensIn(
      BigInt(reserves1.toString()),
      BigInt(reserves2.toString()),
      BigInt(output.toString()),
    );
    const inputSdk = uniswapV2Sdk.getTokensIn(reserves1, reserves2, output);

    const outputSimple = native.getTokensOut(
      BigInt(reserves1.toString()),
      BigInt(reserves2.toString()),
      BigInt(input.toString()),
    );
    const outputSdk = uniswapV2Sdk.getTokensOut(reserves1, reserves2, input);

    expect(inputSimple?.toString()).to.equal(inputSdk?.toString());
    expect(outputSimple?.toString()).to.equal(outputSdk?.toString());
  });

  it('UniswapV2Sdk & UniswapV2Simple - give same errors', function () {
    const reserves1 = ETHER;
    const reserves2 = ETHER.mul(2);
    const output = ETHER.mul(100);
    const input = ETHER.mul(20);

    const inputSimple = native.getTokensIn(
      BigInt(reserves1.toString()),
      BigInt(reserves2.toString()),
      BigInt(output.toString()),
    );
    const inputSdk = uniswapV2Sdk.getTokensIn(reserves1, reserves2, output);

    const outputSimple = native.getTokensOut(
      BigInt(reserves1.toString()),
      BigInt(reserves2.toString()),
      BigInt(input.toString()),
    );
    const outputSdk = uniswapV2Sdk.getTokensOut(reserves1, reserves2, input);

    expect(inputSimple?.toString()).to.equal(inputSdk?.toString());
    expect(outputSimple?.toString()).to.equal(outputSdk?.toString());
  });

  it('Speedtest', function () {
    let reserves1Big = BigInt(ETHER.toString());
    const reserves2Big = BigInt(ETHER.mul(2).toString());
    const inputBig = BigInt(ETHER.div(20).toString());
    let outputBig;

    startTime();

    for (let i = 0; i < 100000; i++) {
      reserves1Big += BigInt(i);
      outputBig = native.getTokensIn(reserves1Big, reserves2Big, inputBig);
    }

    console.log('native swap', outputBig?.toString(), endTime());

    let reserves1 = ETHER;
    const reserves2 = ETHER.mul(2);
    const input = ETHER.div(20);
    let output;

    startTime();

    for (let i = 0; i < 100000; i++) {
      reserves1 = reserves1.add(i);
      output = uniswapV2Simple.getTokensIn(reserves1, reserves2, input);
    }

    console.log('simple swap', output?.toString(), endTime());
  });
});

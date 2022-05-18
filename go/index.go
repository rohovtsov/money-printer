package main

import (
	"fmt"
	"math/big"
	"time"
)

var ZERO big.Int
var d997 = big.NewInt(997)
var d1000 = big.NewInt(1000)
var amountInWithFee big.Int
var numerator big.Int
var denominator big.Int
var outputAmount big.Int

func getTokensOut(reserveIn *big.Int, reserveOut *big.Int, amountIn *big.Int) *big.Int {
	if reserveIn.Cmp(&ZERO) < 1 || reserveOut.Cmp(&ZERO) < 1 || amountIn.Cmp(&ZERO) < 1 {
		//InsufficientReservesError
		return &ZERO
	}

	amountInWithFee.Mul(amountIn, d997)
	numerator.Mul(&amountInWithFee, reserveOut)
	denominator.Mul(reserveIn, d1000)
	denominator.Add(&denominator, &amountInWithFee)
	outputAmount.Div(&numerator, &denominator)

	return &outputAmount
}

func makeTimestamp() int64 {
	return time.Now().UnixNano() / int64(time.Millisecond)
}

func test() {
	var reserves0 = big.NewInt(1000000000000000000)
	var reserves1 = big.NewInt(2000000000000000000)
	var input = big.NewInt(100)
	var lastValue *big.Int
	var delta *big.Int
	start := makeTimestamp()

	var reserves0New big.Int
	var reserves1New big.Int
	var inputNew big.Int

	for i := 1; i <= 5000000; i++ {
		delta = big.NewInt(int64(i))
		reserves0New.Sub(reserves0, delta)
		reserves1New.Add(reserves1, delta)
		inputNew.Mul(input, delta)
		lastValue = getTokensOut(&reserves0New, &reserves1New, &inputNew)
	}

	fmt.Println(lastValue, makeTimestamp()-start)
}

func main() {
	fmt.Println("hello world")

	go test()

	time.Sleep(time.Second * 5)
}

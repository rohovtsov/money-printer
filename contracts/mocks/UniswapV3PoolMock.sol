pragma solidity ^0.8.0;

contract UniswapV3PoolMock {
    struct Slot0 {
        // the current price
        uint160 sqrtPriceX96;
        // the current tick
        int24 tick;
        // the most-recently updated index of the observations array
        uint16 observationIndex;
        // the current maximum number of observations that are being stored
        uint16 observationCardinality;
        // the next maximum number of observations to store, triggered in observations.write
        uint16 observationCardinalityNext;
        // the current protocol fee as a percentage of the swap fee taken on withdrawal
        // represented as an integer denominator (1/x)%
        uint8 feeProtocol;
        // whether the pool is locked
        bool unlocked;
    }
    Slot0 public slot0;

    constructor() {
        slot0.sqrtPriceX96 = 42;
    }

    function fee() external returns (int24) {
        return 1488;
    }

    function token0() external returns (address) {
        return 0x0000000000000000000000000000000000000000;
    }

    function token1() external returns (address) {
        return 0x0000000000000000000000000000000000000001;
    }
}

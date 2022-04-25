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

    function tickSpacing() external view returns (int24) {
        return 60;
    }

    function tickBitmap(int16 wordPosition) external view returns (uint256) {
        return wordPosition > 0 ? 1 : 0;
    }

    function ticks(int24 tick) external view returns (
        uint128 liquidityGross,
        int128 liquidityNet,
        uint256 feeGrowthOutside0X128,
        uint256 feeGrowthOutside1X128,
        int56 tickCumulativeOutside,
        uint160 secondsPerLiquidityOutsideX128,
        uint32 secondsOutside,
        bool initialized
    ) {
        liquidityGross = 0;
        liquidityNet = 0;
        feeGrowthOutside0X128 = 0;
        feeGrowthOutside1X128 = 0;
        tickCumulativeOutside = 0;
        secondsPerLiquidityOutsideX128 = 0;
        secondsOutside = 0;
        initialized = false;
    }

    function feeGrowthGlobal0X128() external view returns (uint256) {
        return 0;
    }

    function feeGrowthGlobal1X128() external view returns (uint256) {
        return 0;
    }

    function protocolFees() external view returns (uint128 token0, uint128 token1) {
        token0 = 0;
        token1 = 0;
    }

    function liquidity() external view returns (uint128) {
        return 0;
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

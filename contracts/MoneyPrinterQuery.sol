pragma solidity ^0.8.0;

//TODO: remove console.log
import "hardhat/console.sol";
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';

//TODO: recheck type casting
//TODO: reuse uniswap libraries?
import './libraries/BitMath.sol';

contract MoneyPrinterQuery {
    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = -MIN_TICK;

    //TODO: recheck type casting
    //TODO: reuse uniswap libraries?
    //TODO: recheck
    function nextInitializedTickWithinOneWord(
        IUniswapV3Pool pool,
        int24 tick,
        int24 tickSpacing
    ) internal view returns (int24 next, bool initialized) {
        int24 compressed = tick / tickSpacing;
        if (tick < 0 && tick % tickSpacing != 0) compressed--; // round towards negative infinity

        // start from the word of the next tick, since the current tick state doesn't matter
        compressed = compressed + 1;
        int16 wordPos = int16(compressed >> 8);
        uint8 bitPos = uint8(uint24(compressed) % 256);

        // all the 1s at or to the left of the bitPos
        uint256 mask = ~((1 << bitPos) - 1);
        uint256 masked = pool.tickBitmap(wordPos) & mask;

        // if there are no initialized ticks to the left of the current tick, return leftmost in the word
        initialized = masked != 0;
        // overflow/underflow is possible, but prevented externally by limiting both tickSpacing and tick
        next = initialized
        ? (compressed + int24(BitMath.leastSignificantBit(masked) - uint24(bitPos))) * tickSpacing
        : (compressed + int24(type(uint8).max - uint24(bitPos))) * tickSpacing;
    }

    function getTicksForPool(IUniswapV3Pool pool, uint24 initialBufferSize) public view returns (int128[] memory) {
        int128[] memory buffer = new int128[](2 * initialBufferSize);
        uint24 bufferSize = 0;

        int24 tickSpacing = pool.tickSpacing();
        int24 currentTick = MIN_TICK;
        int128 liquidityNet;
        bool initialized;

        while (currentTick <= MAX_TICK) {
            (currentTick, initialized) = nextInitializedTickWithinOneWord(
                pool,
                currentTick,
                tickSpacing
            );

            if (initialized) {
                (,liquidityNet,,,,,,) = pool.ticks(currentTick);
                buffer[bufferSize++] = currentTick;
                buffer[bufferSize++] = liquidityNet;
            }
        }

        int128[] memory result = new int128[](bufferSize);
        for (uint24 i = 0; i < result.length; i++) {
            result[i] = buffer[i];
        }

        return result;
    }

    struct StateForPool {
        uint160 sqrtPriceX96;
        int24 tick;
        uint128 liquidity;
        int128[] ticks;
    }

    function getStateForPool(IUniswapV3Pool pool, uint24 initialBufferSize) public view returns (StateForPool memory) {
        StateForPool memory state;

        (state.sqrtPriceX96,state.tick,,,,,) = pool.slot0();
        state.liquidity = pool.liquidity();
        state.ticks = getTicksForPool(pool, initialBufferSize);

        return state;
    }

    function getStatesForPools(IUniswapV3Pool[] calldata pools, uint24[] calldata initialBufferSizes) external view returns (StateForPool[] memory) {
        StateForPool[] memory states = new StateForPool[](pools.length);

        for (uint i = 0; i < pools.length; i++) {
            states[i] = getStateForPool(pools[i], initialBufferSizes[i]);
        }

        return states;
    }

    //TODO: consider adding into response bundle
    function blockNumber() external view returns (uint256) {
        return block.number;
    }
}

pragma solidity ^0.8.0;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';

library BitMath {
    /// @notice Returns the index of the least significant bit of the number,
    ///     where the least significant bit is at index 0 and the most significant bit is at index 255
    /// @dev The function satisfies the property:
    ///     (x & 2**leastSignificantBit(x)) != 0 and (x & (2**(leastSignificantBit(x)) - 1)) == 0)
    /// @param x the value for which to compute the least significant bit, must be greater than 0
    /// @return r the index of the least significant bit
    function leastSignificantBit(uint256 x) internal pure returns (uint8 r) {
        require(x > 0);

        r = 255;
        if (x & type(uint128).max > 0) {
            r -= 128;
        } else {
            x >>= 128;
        }
        if (x & type(uint64).max > 0) {
            r -= 64;
        } else {
            x >>= 64;
        }
        if (x & type(uint32).max > 0) {
            r -= 32;
        } else {
            x >>= 32;
        }
        if (x & type(uint16).max > 0) {
            r -= 16;
        } else {
            x >>= 16;
        }
        if (x & type(uint8).max > 0) {
            r -= 8;
        } else {
            x >>= 8;
        }
        if (x & 0xf > 0) {
            r -= 4;
        } else {
            x >>= 4;
        }
        if (x & 0x3 > 0) {
            r -= 2;
        } else {
            x >>= 2;
        }
        if (x & 0x1 > 0) r -= 1;
    }
}

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

    function getTicksForPool(IUniswapV3Pool pool, uint24 initialBufferSize) internal view returns (int128[] memory) {
        bool initialized;
        uint24 bufferSize = 0;
        uint24 maxBufferSize = 2 * initialBufferSize;
        int24 tickSpacing = pool.tickSpacing();
        int24 currentTick = MIN_TICK;
        int128 liquidityNet;
        int128[] memory buffer = new int128[](maxBufferSize);

        while (currentTick <= MAX_TICK) {
            (currentTick, initialized) = nextInitializedTickWithinOneWord(
                pool,
                currentTick,
                tickSpacing
            );

            if (initialized) {
                //усли мы не угадали с размером буффера, то перезапускаемся с двойным размером буффера
                if (bufferSize >= maxBufferSize) {
                    //TODO: Внимание при изменении контракта! Разные по смыслу переменные. Для экономии газа initialBufferSize * 2 заменили на maxBufferSize!
                    return getTicksForPool(pool, maxBufferSize);
                }

                (,liquidityNet,,,,,,) = pool.ticks(currentTick);
                buffer[bufferSize++] = currentTick;
                buffer[bufferSize++] = liquidityNet;

                //TESTED on goerli - there are no ticks with liquidityNet === 0
                //require(liquidityNet != 0, 'ZERO LIQUIDITY');
            }
        }

        return buffer;
    }

    struct StateForPool {
        int24 tick;
        uint128 liquidity;
        uint160 sqrtPriceX96;
        int128[] ticks;
    }

    function getStateForPool(IUniswapV3Pool pool, uint24 initialBufferSize) internal view returns (StateForPool memory) {
        StateForPool memory state;

        (state.sqrtPriceX96,state.tick,,,,,) = pool.slot0();
        state.liquidity = pool.liquidity();
        state.ticks = getTicksForPool(pool, initialBufferSize);

        return state;
    }

    function getStatesForPools(IUniswapV3Pool[] calldata pools, uint24[] calldata initialBufferSizes) external view returns (uint256 blockNumber, StateForPool[] memory states) {
        blockNumber = block.number;
        states = new StateForPool[](pools.length);

        for (uint i = 0; i < pools.length; i++) {
            states[i] = getStateForPool(pools[i], initialBufferSizes[i]);
        }
    }
}

pragma solidity ^0.8.0;

import "hardhat/console.sol";
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';

contract MoneyPrinterQuery {
    IQuoter private quoter;

    constructor(IQuoter _quoter) {
        quoter = _quoter;
    }

    function getTickBitmapForPool(IUniswapV3Pool pool, int16 fromTick, int16 toTick) external view returns (int256[2][] memory) {
        uint256 count = uint16(8000);
        int256[2][] memory result = new int256[2][](count);
        uint256 id = 0;

        for (int16 i = fromTick; i <= toTick; i++) {
            uint256 val = pool.tickBitmap(i);
            if (val != 0 && id < result.length) {
                result[id][0] = i;
                result[id][1] = int256(val);
                id++;
            }
        }

        int256[2][] memory result2 = new int256[2][](id);
        for (uint256 i = 0; i < result2.length; i++) {
            result2[i][0] = result[i][0];
            result2[i][1] = result[i][1];
        }

        return result2;
    }

    function getTicksForPool(IUniswapV3Pool pool, uint24 depth) external view returns (int256[2][] memory) {
        int256[2][] memory result = new int256[2][](depth * 2 + 1);
        (,int24 tick,,,,,) = pool.slot0();
        int24 tickSpacing = pool.tickSpacing();
        int24 tickStart = (tick / tickSpacing) * tickSpacing;

        for (uint24 i = 0; i < result.length; i++) {
            int24 id = tickStart + (i % 2 == 0 ? int24(1) : int24(-1)) * ((int24(i + 1)) / 2) * tickSpacing;
            (,int128 liquidityNet,,,,,,) = pool.ticks(id);
            result[i][0] = id;
            result[i][1] = liquidityNet;
        }

        return result;
    }

    struct StateForPool {
        uint160 sqrtPriceX96;
        int24 tick;
        uint16 observationIndex;
        uint16 observationCardinality;
        uint16 observationCardinalityNext;
        uint8 feeProtocol;
        bool unlocked;
        int24 tickSpacing;
        uint256 feeGrowthGlobal0X128;
        uint256 feeGrowthGlobal1X128;
        uint128 liquidity;
        uint128 token0ProtocolFees;
        uint128 token1ProtocolFees;
    }

    function getStateForPool(IUniswapV3Pool pool) external view returns (StateForPool memory) {
        StateForPool memory state;

        (
            state.sqrtPriceX96,
            state.tick,
            state.observationIndex,
            state.observationCardinality,
            state.observationCardinalityNext,
            state.feeProtocol,
            state.unlocked
        ) = pool.slot0();

        (
            state.token0ProtocolFees,
            state.token1ProtocolFees
        ) = pool.protocolFees();

        state.tickSpacing = pool.tickSpacing();
        state.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128();
        state.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128();
        state.liquidity = pool.liquidity();

        return state;
    }

    function getPricesForPools(
        IUniswapV3Pool[] calldata pools,
        uint256[] calldata amounts
    ) external returns (uint256[2][][] memory) {
        uint256[2][][] memory result = new uint256[2][][](pools.length);

        for (uint i = 0; i < pools.length; i++) {
            result[i] = new uint256[2][](amounts.length);
            address token0 = pools[i].token0();
            address token1 = pools[i].token1();
            uint24 fee = pools[i].fee();

            for (uint j = 0; j < amounts.length; j++) {
                try quoter.quoteExactInputSingle(token0, token1, fee, amounts[j], 0) returns (uint256 amountOut) {
                    result[i][j][0] = amountOut;
                } catch {
                    result[i][j][0] = 0;
                }

                try quoter.quoteExactInputSingle(token1, token0, fee, amounts[j], 0) returns (uint256 amountOut) {
                    result[i][j][1] = amountOut;
                } catch {
                    result[i][j][1] = 0;
                }
            }
        }

        return result;
    }
}

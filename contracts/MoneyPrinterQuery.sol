pragma solidity ^0.8.0;

import "hardhat/console.sol";
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol';

contract MoneyPrinterQuery {
    IQuoter private quoter;

    constructor(IQuoter _quoter) {
        quoter = _quoter;
    }

    function getPricesForPools(
        IUniswapV3Pool[] calldata pools,
        uint256[] calldata amounts
    ) external returns (uint256[2][][] memory) {
        uint256[2][][] memory result = new uint256[2][][](pools.length);

        for (uint i = 0; i < pools.length; i++) {
            result[i] = new uint256[2][](amounts.length);

            for (uint j = 0; j < amounts.length; j++) {
                try quoter.quoteExactInputSingle(pools[i].token0(), pools[i].token1(), pools[i].fee(), amounts[j], 0) returns (uint256 amountOut) {
                    result[i][j][0] = amountOut;
                } catch {
                    result[i][j][0] = 0;
                }

                try quoter.quoteExactInputSingle(pools[i].token1(), pools[i].token0(), pools[i].fee(), amounts[j], 0) returns (uint256 amountOut) {
                    result[i][j][1] = amountOut;
                } catch {
                    result[i][j][1] = 0;
                }
            }
        }

        return result;
    }
}

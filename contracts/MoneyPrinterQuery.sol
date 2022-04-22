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

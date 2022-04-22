pragma solidity ^0.8.0;

contract UniswapV3QuoterMock {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut) {
        require(666 == 0, "Unexpected error");
        return 666 * amountIn;
    }

    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountOut,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountIn) {
        return 228 * amountOut;
    }
}

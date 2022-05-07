//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

pragma experimental ABIEncoderV2;

import '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

interface IERC20 {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
}

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint) external;
}

library ErrHelper {
    function getRevertMsg(bytes memory _returnData) internal pure returns (string memory) {
        // If the _res length is less than 68, then the transaction failed silently (without a revert message)
        if (_returnData.length < 68) return 'Q0';

        assembly {
        // Slice the sighash.
            _returnData := add(_returnData, 0x04)
        }
        return abi.decode(_returnData, (string)); // All that remains is the revert string
    }

    function uintToString(uint v) internal pure returns (string memory str) {
        uint maxlength = 100;
        bytes memory reversed = new bytes(maxlength);
        uint i = 0;
        while (v != 0) {
            uint remainder = v % 10;
            v = v / 10;
            reversed[i++] = bytes1(uint8(48 + remainder));
        }
        bytes memory s = new bytes(i + 1);
        for (uint j = 0; j <= i; j++) {
            s[j] = reversed[i - j];
        }
        str = string(s);
    }
}

library TransferHelper {
    /// @notice Transfers tokens from msg.sender to a recipient
    /// @dev Errors with ST if transfer fails
    /// @param token The contract address of the token which will be transferred
    /// @param to The recipient of the transfer
    /// @param value The value of the transfer
    function safeTransfer(
        address token,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), string(abi.encodePacked("qST", ErrHelper.getRevertMsg(data))));
    }
}

// This contract simply calls multiple targets sequentially, ensuring WETH balance before and after

contract MoneyPrinter is IUniswapV2Callee, IUniswapV3SwapCallback {
    bool locked = false;
    address private immutable owner;
    address private immutable executor;
    IWETH private immutable WETH;

    modifier onlyExecutor() {
        require(msg.sender == executor);
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier lock() {
        require(locked == false, 'QL');
        locked = true;
        _;
        locked = false;
    }

    modifier onlyLocked() {
        require(locked == true, 'QOL');
        _;
    }

    constructor(address _executor, address _WETH9_address) payable {
        owner = msg.sender;
        executor = _executor;
        WETH = IWETH(_WETH9_address);
        if (msg.value > 0) {
            IWETH(_WETH9_address).deposit{value: msg.value}();
        }
    }

    receive() external payable {}

    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external onlyLocked override {
        // onlyLocked ensures that the contract is locked and called by owner/executor
//        address token0 = IUniswapV2Pair(msg.sender).token0(); // fetch the address of token0
//        address token1 = IUniswapV2Pair(msg.sender).token1(); // fetch the address of token1
//        assert(msg.sender == factoryV2.getPair(token0, token1)); // ensure that msg.sender is a V2 pair
        (uint256 returnAmount, address[] memory _targets,  bytes[] memory _payloads) = abi.decode(data, (uint256, address[], bytes[]));
        performOperations(_targets, _payloads);
        require(WETH.transfer(msg.sender, returnAmount), 'Q1'); // потом вернуть деньги с комиссией
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external onlyLocked override {
        require(amount0Delta > 0 || amount1Delta > 0, 'Q5'); // swaps entirely within 0-liquidity regions are not supported
        IUniswapV3Pool senderContract = IUniswapV3Pool(msg.sender);
        address token0 = senderContract.token0();
        address token1 = senderContract.token1();

        if (data.length > 0) {
            (uint256 _returnAmount_unused, address[] memory _targets,  bytes[] memory _payloads) = abi.decode(data, (uint256, address[], bytes[]));
            performOperations(_targets, _payloads);
        }

//        uint24 fee = senderContract.fee();
//        require(msg.sender == factoryV3.getPool(token0, token1, fee), 'Q6'); // ensure that msg.sender is a V3 pool

//        address token = amount0Delta > 0 ? token0 : token1;
//        uint bal0 = IERC20(token0).balanceOf(address(this));
//        uint bal1 = IERC20(token1).balanceOf(address(this));
//        require(uint256(amount0Delta) < bal0 && uint256(amount0Delta) < bal1, string(
//                abi.encodePacked(
//                    "need ",
//                    ErrHelper.uintToString(uint256(amount0Delta)),
////                    " or ",
////                    ErrHelper.uintToString(uint256(amount1Delta)),
//                    " have ",
//                    ErrHelper.uintToString(bal0),
//                    " and ",
//                    ErrHelper.uintToString(bal1)
//                )
//            ));

        TransferHelper.safeTransfer(amount0Delta > 0 ? token0 : token1, msg.sender, uint256(amount0Delta > 0 ? amount0Delta : amount1Delta));
    }

    function printMoney(uint256 _ethAmountToCoinbase, address[] memory _targets, bytes[] memory _payloads) external lock onlyExecutor payable {
        uint256 wethBalanceBefore = WETH.balanceOf(address(this));

        performOperations(_targets, _payloads);

        uint256 wethBalanceAfter = WETH.balanceOf(address(this));
        require(wethBalanceAfter > wethBalanceBefore + _ethAmountToCoinbase, "Q3");

        if (_ethAmountToCoinbase > 0) {
            uint256 _ethBalance = address(this).balance;
            if (_ethBalance < _ethAmountToCoinbase) {
                WETH.withdraw(_ethAmountToCoinbase - _ethBalance);
            }
            block.coinbase.transfer(_ethAmountToCoinbase);
        }

        WETH.transfer(executor, WETH.balanceOf(address(this)));
    }

    function performOperations(address[] memory _targets, bytes[] memory _payloads) private onlyLocked {
        require (_targets.length == _payloads.length, "Q2");
        for (uint64 i = 0; i < _targets.length; i++) {
            (bool _success, bytes memory _response) = _targets[i].call(_payloads[i]);
            require(_success, ErrHelper.getRevertMsg(_response)); _response;
        }
    }

    function call(address payable _to, uint256 _value, bytes calldata _data) external onlyOwner payable returns (bytes memory) {
        require(_to != address(0));
        (bool _success, bytes memory _result) = _to.call{value: _value}(_data);
        require(_success);
        return _result;
    }
}

//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

pragma experimental ABIEncoderV2;

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

// This contract simply calls multiple targets sequentially, ensuring WETH balance before and after

contract MoneyPrinter is IUniswapV2Callee {
    address private immutable owner;
    address private immutable executor;
    IUniswapV2Factory private constant factoryV2 = IUniswapV2Factory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
//    IWETH private constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2); // mainnet
    IWETH private constant WETH = IWETH(0xc778417E063141139Fce010982780140Aa0cD5Ab); // ropsten

    modifier onlyExecutor() {
        require(msg.sender == executor);
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    constructor(address _executor) payable {
        owner = msg.sender;
        executor = _executor;
        if (msg.value > 0) {
            WETH.deposit{value: msg.value}();
        }
    }

    receive() external payable {
    }

    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external override {
        address token0 = IUniswapV2Pair(msg.sender).token0(); // fetch the address of token0
        address token1 = IUniswapV2Pair(msg.sender).token1(); // fetch the address of token1
        assert(msg.sender == factoryV2.getPair(token0, token1)); // ensure that msg.sender is a V2 pair
        (uint256 _amountToFirstMarket, address _tokenToFirstMarket, uint256 _wethBeforeAmount, uint256 _ethAmountToCoinbase, address[] memory _targets,  bytes[] memory _payloads) = abi.decode(data, (uint256, address, uint256, uint256, address[], bytes[]));
        performTriangle(_amountToFirstMarket, _tokenToFirstMarket, _wethBeforeAmount, _ethAmountToCoinbase, _targets, _payloads); // надо выполнить все тоже самое что в uniswapWeth
        require(WETH.transfer(msg.sender, _wethBeforeAmount), 'Q1'); // потом вернуть деньги с комиссией
    }

    function uniswapWeth(uint256 _amountToFirstMarket, uint256 _ethAmountToCoinbase, address[] memory _targets, bytes[] memory _payloads) external onlyExecutor payable {
        performTriangle(_amountToFirstMarket, address(WETH), 0, _ethAmountToCoinbase, _targets, _payloads);
    }

    function performTriangle(
        uint256 _amountToFirstMarket,
        address _tokenToFirstMarket,
        uint256 _wethBeforeAmount,
        uint256 _ethAmountToCoinbase,
        address[] memory _targets,
        bytes[] memory _payloads
    ) private {
        require (_targets.length == _payloads.length, "Q2");
        uint256 _wethBalanceBefore = _wethBeforeAmount > 0 ? _wethBeforeAmount : WETH.balanceOf(address(this));
        IERC20(_tokenToFirstMarket).transfer(_targets[0], _amountToFirstMarket);
        for (uint64 i = 0; i < _targets.length; i++) {
            (bool _success, bytes memory _response) = _targets[i].call(_payloads[i]);
            require(_success, "Q4"); _response;
        }

        uint256 _wethBalanceAfter = WETH.balanceOf(address(this));
        require(_wethBalanceAfter > _wethBalanceBefore + _ethAmountToCoinbase, "Q3");
        if (_ethAmountToCoinbase == 0) {
            return;
        }

        uint256 _ethBalance = address(this).balance;
        if (_ethBalance < _ethAmountToCoinbase) {
            WETH.withdraw(_ethAmountToCoinbase - _ethBalance);
        }
        block.coinbase.transfer(_ethAmountToCoinbase);
    }

    function withdrawWeth(uint256 _wethAmount, address _to) external onlyOwner {
        WETH.transfer(_to, _wethAmount);
    }

    function call(address payable _to, uint256 _value, bytes calldata _data) external onlyOwner payable returns (bytes memory) {
        require(_to != address(0));
        (bool _success, bytes memory _result) = _to.call{value: _value}(_data);
        require(_success);
        return _result;
    }
}

export const UNISWAP_QUERY_ABI = [{
  "inputs": [{
    "internalType": "contract UniswapV2Factory",
    "name": "_uniswapFactory",
    "type": "address"
  }, {"internalType": "uint256", "name": "_start", "type": "uint256"}, {
    "internalType": "uint256",
    "name": "_stop",
    "type": "uint256"
  }],
  "name": "getPairsByIndexRange",
  "outputs": [{"internalType": "address[3][]", "name": "", "type": "address[3][]"}],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{"internalType": "contract IUniswapV2Pair[]", "name": "_pairs", "type": "address[]"}],
  "name": "getReservesByPairs",
  "outputs": [{"internalType": "uint256[3][]", "name": "", "type": "uint256[3][]"}],
  "stateMutability": "view",
  "type": "function"
}]

export const BUNDLE_EXECUTOR_ABI = [{
  "inputs": [{
    "internalType": "address payable",
    "name": "_to",
    "type": "address"
  }, {"internalType": "uint256", "name": "_value", "type": "uint256"}, {
    "internalType": "bytes",
    "name": "_data",
    "type": "bytes"
  }],
  "name": "call",
  "outputs": [{"internalType": "bytes", "name": "", "type": "bytes"}],
  "stateMutability": "payable",
  "type": "function"
}, {
  "inputs": [{"internalType": "address", "name": "_executor", "type": "address"}],
  "stateMutability": "payable",
  "type": "constructor"
}, {
  "inputs": [{
    "internalType": "uint256",
    "name": "_wethAmountToFirstMarket",
    "type": "uint256"
  }, {"internalType": "uint256", "name": "_ethAmountToCoinbase", "type": "uint256"}, {
    "internalType": "address[]",
    "name": "_targets",
    "type": "address[]"
  }, {"internalType": "bytes[]", "name": "_payloads", "type": "bytes[]"}],
  "name": "uniswapWeth",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
}, {"stateMutability": "payable", "type": "receive"}]


export const UNISWAP_PAIR_ABI = [{
  "inputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "constructor"
}, {
  "anonymous": false,
  "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
    "indexed": true,
    "internalType": "address",
    "name": "spender",
    "type": "address"
  }, {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}],
  "name": "Approval",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{"indexed": true, "internalType": "address", "name": "sender", "type": "address"}, {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
  }, {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"}, {
    "indexed": true,
    "internalType": "address",
    "name": "to",
    "type": "address"
  }],
  "name": "Burn",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{"indexed": true, "internalType": "address", "name": "sender", "type": "address"}, {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount0",
    "type": "uint256"
  }, {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"}],
  "name": "Mint",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{"indexed": true, "internalType": "address", "name": "sender", "type": "address"}, {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount0In",
    "type": "uint256"
  }, {"indexed": false, "internalType": "uint256", "name": "amount1In", "type": "uint256"}, {
    "indexed": false,
    "internalType": "uint256",
    "name": "amount0Out",
    "type": "uint256"
  }, {"indexed": false, "internalType": "uint256", "name": "amount1Out", "type": "uint256"}, {
    "indexed": true,
    "internalType": "address",
    "name": "to",
    "type": "address"
  }],
  "name": "Swap",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{"indexed": false, "internalType": "uint112", "name": "reserve0", "type": "uint112"}, {
    "indexed": false,
    "internalType": "uint112",
    "name": "reserve1",
    "type": "uint112"
  }],
  "name": "Sync",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{"indexed": true, "internalType": "address", "name": "from", "type": "address"}, {
    "indexed": true,
    "internalType": "address",
    "name": "to",
    "type": "address"
  }, {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}],
  "name": "Transfer",
  "type": "event"
}, {
  "constant": true,
  "inputs": [],
  "name": "DOMAIN_SEPARATOR",
  "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "MINIMUM_LIQUIDITY",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "PERMIT_TYPEHASH",
  "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [{"internalType": "address", "name": "", "type": "address"}, {
    "internalType": "address",
    "name": "",
    "type": "address"
  }],
  "name": "allowance",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {
    "internalType": "uint256",
    "name": "value",
    "type": "uint256"
  }],
  "name": "approve",
  "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": true,
  "inputs": [{"internalType": "address", "name": "", "type": "address"}],
  "name": "balanceOf",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "address", "name": "to", "type": "address"}],
  "name": "burn",
  "outputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
    "internalType": "uint256",
    "name": "amount1",
    "type": "uint256"
  }],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "decimals",
  "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "factory",
  "outputs": [{"internalType": "address", "name": "", "type": "address"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "getReserves",
  "outputs": [{"internalType": "uint112", "name": "_reserve0", "type": "uint112"}, {
    "internalType": "uint112",
    "name": "_reserve1",
    "type": "uint112"
  }, {"internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "address", "name": "_token0", "type": "address"}, {
    "internalType": "address",
    "name": "_token1",
    "type": "address"
  }],
  "name": "initialize",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "kLast",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "address", "name": "to", "type": "address"}],
  "name": "mint",
  "outputs": [{"internalType": "uint256", "name": "liquidity", "type": "uint256"}],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "name",
  "outputs": [{"internalType": "string", "name": "", "type": "string"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [{"internalType": "address", "name": "", "type": "address"}],
  "name": "nonces",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "address", "name": "owner", "type": "address"}, {
    "internalType": "address",
    "name": "spender",
    "type": "address"
  }, {"internalType": "uint256", "name": "value", "type": "uint256"}, {
    "internalType": "uint256",
    "name": "deadline",
    "type": "uint256"
  }, {"internalType": "uint8", "name": "v", "type": "uint8"}, {
    "internalType": "bytes32",
    "name": "r",
    "type": "bytes32"
  }, {"internalType": "bytes32", "name": "s", "type": "bytes32"}],
  "name": "permit",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "price0CumulativeLast",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "price1CumulativeLast",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "address", "name": "to", "type": "address"}],
  "name": "skim",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "uint256", "name": "amount0Out", "type": "uint256"}, {
    "internalType": "uint256",
    "name": "amount1Out",
    "type": "uint256"
  }, {"internalType": "address", "name": "to", "type": "address"}, {
    "internalType": "bytes",
    "name": "data",
    "type": "bytes"
  }],
  "name": "swap",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "symbol",
  "outputs": [{"internalType": "string", "name": "", "type": "string"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [],
  "name": "sync",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "token0",
  "outputs": [{"internalType": "address", "name": "", "type": "address"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "token1",
  "outputs": [{"internalType": "address", "name": "", "type": "address"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "totalSupply",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "address", "name": "to", "type": "address"}, {
    "internalType": "uint256",
    "name": "value",
    "type": "uint256"
  }],
  "name": "transfer",
  "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{"internalType": "address", "name": "from", "type": "address"}, {
    "internalType": "address",
    "name": "to",
    "type": "address"
  }, {"internalType": "uint256", "name": "value", "type": "uint256"}],
  "name": "transferFrom",
  "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}]

export const UNISWAP_PAIR_CREATED_EVENT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "token1",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "pair",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "PairCreated",
    "type": "event"
  }
];

export const UNISWAP_POOL_CREATED_EVENT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "token1",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint24",
        "name": "fee",
        "type": "uint24"
      },
      {
        "indexed": false,
        "internalType": "int24",
        "name": "tickSpacing",
        "type": "int24"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "pool",
        "type": "address"
      }
    ],
    "name": "PoolCreated",
    "type": "event"
  }
];

export const UNISWAP_V3_QUOTER_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_factory",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_WETH9",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "WETH9",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "factory",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "path",
        "type": "bytes"
      },
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      }
    ],
    "name": "quoteExactInput",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "internalType": "uint24",
        "name": "fee",
        "type": "uint24"
      },
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "internalType": "uint160",
        "name": "sqrtPriceLimitX96",
        "type": "uint160"
      }
    ],
    "name": "quoteExactInputSingle",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "path",
        "type": "bytes"
      },
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "name": "quoteExactOutput",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "internalType": "uint24",
        "name": "fee",
        "type": "uint24"
      },
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      },
      {
        "internalType": "uint160",
        "name": "sqrtPriceLimitX96",
        "type": "uint160"
      }
    ],
    "name": "quoteExactOutputSingle",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "int256",
        "name": "amount0Delta",
        "type": "int256"
      },
      {
        "internalType": "int256",
        "name": "amount1Delta",
        "type": "int256"
      },
      {
        "internalType": "bytes",
        "name": "path",
        "type": "bytes"
      }
    ],
    "name": "uniswapV3SwapCallback",
    "outputs": [],
    "stateMutability": "view",
    "type": "function"
  }
];

export const PRINTER_QUERY_ABI = [
  {
    "inputs": [
      {
        "internalType": "contract IQuoter",
        "name": "_quoter",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "contract IUniswapV3Pool[]",
        "name": "pools",
        "type": "address[]"
      },
      {
        "internalType": "uint256[]",
        "name": "amounts",
        "type": "uint256[]"
      }
    ],
    "name": "getPricesForPools",
    "outputs": [
      {
        "internalType": "uint256[2][][]",
        "name": "",
        "type": "uint256[2][][]"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

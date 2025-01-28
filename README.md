Money Printer – MEV Arbitrage Uniswap V2 / V3
================
This repository is a reluctant publishing, it contains interesting engineering approaches in MEV arbitrage on Uniswap Markets, which me and my friend had 3 years ago.
It did have a good potential, though being sole players eventually we faced lot's of issues with flashbots api: shuffling bundles and getting included on wrong blocks by unfair miners. Which has put us off a bit from this venture.

This bot was scanning all swap opportunities of the uniswap V2 & V3 markets, borrowing WETH from Uniswap. It was filtering through all possible trading chains of 2 and 3 markets (configurable up to N amount), monitoring the market state changes realtime and recalculating opportunities.
It was used along with the local MEV ethereum node, local flashbots simulations to maximize requests throughput.
The bot was highly focused on local calculations speed. It's got a **beautifully decompiled and optimized UniswapV3 SDK** to x100 speed using BigInts and fast SQRT methods.
It's got the **sophisticated derivatives of trade formulas** for calculating optimum borrowing amounts for trading chains of V2 and V3 – which enables trading **at the point of diminishing returns** (when the price shift after your trade was eating up more then you could profit from trading higher volumes).
This WETH amount prediction was particularly challenging to implement for V3 markets, as they're using distributed liquidity.

All in all, it was a beautiful experience, and I've realised the level of the competition present. I'm afraid it has a little chance without a system approach.

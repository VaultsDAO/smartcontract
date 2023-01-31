// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.6;

library DataTypes {
    /// @dev tw: time-weighted
    /// @param twPremiumX96 overflow inspection (as twPremiumX96 > twPremiumDivBySqrtPriceX96):
    //         max = 2 ^ (255 - 96) = 2 ^ 159 = 7.307508187E47
    //         assume premium = 10000, time = 10 year = 60 * 60 * 24 * 365 * 10 -> twPremium = 3.1536E12
    struct Growth {
        int256 twLongPremiumX96;
        int256 twLongPremiumDivBySqrtPriceX96;
        int256 twShortPremiumX96;
        int256 twShortPremiumDivBySqrtPriceX96;
    }
    struct AddLiquidityParams {
        address baseToken;
        int24 lowerTick;
        int24 upperTick;
        uint128 liquidity;
        uint256 deadline;
    }

    struct AddLiquidityResponse {
        uint256 base;
        uint256 quote;
        uint256 fee;
        uint128 liquidity;
    }

    struct AccountMarketInfo {
        int256 takerPositionSize;
        int256 takerOpenNotional;
        int256 lastLongTwPremiumGrowthGlobalX96;
        int256 lastShortTwPremiumGrowthGlobalX96;
    }

    struct RemoveLiquidityParams {
        address baseToken;
        int24 lowerTick;
        int24 upperTick;
        uint128 liquidity;
        uint256 deadline;
    }

    struct RemoveLiquidityResponse {
        uint256 base;
        uint256 quote;
        uint256 fee;
    }

    struct OpenPositionParams {
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint256 deadline;
        uint160 sqrtPriceLimitX96;
        bytes32 referralCode;
    }

    struct ClosePositionParams {
        address baseToken;
        uint160 sqrtPriceLimitX96;
        uint256 oppositeAmountBound;
        uint256 deadline;
        bytes32 referralCode;
    }
}

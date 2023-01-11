// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

library Market {
    /// @param lastTwPremiumGrowthGlobalX96 the last time weighted premiumGrowthGlobalX96
    struct Info {
        int256 longPositionSize;
        int256 shortPositionSize;
    }
}

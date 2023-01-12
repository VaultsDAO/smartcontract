// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

library Tick {
    // struct GrowthInfo {
    //     uint256 feeX128;
    // }

    // /// @dev call this function only if (liquidityGrossBefore == 0 && liquidityDelta != 0)
    // /// @dev per Uniswap: we assume that all growths before a tick is initialized happen "below" the tick
    // function initialize(
    //     mapping(int24 => GrowthInfo) storage self,
    //     int24 tick,
    //     int24 currentTick,
    //     GrowthInfo memory globalGrowthInfo
    // ) internal {
    //     if (tick <= currentTick) {
    //         GrowthInfo storage growthInfo = self[tick];
    //         growthInfo.feeX128 = globalGrowthInfo.feeX128;
    //     }
    // }

    // function cross(mapping(int24 => GrowthInfo) storage self, int24 tick, GrowthInfo memory globalGrowthInfo) internal {
    //     GrowthInfo storage growthInfo = self[tick];
    //     growthInfo.feeX128 = globalGrowthInfo.feeX128 - growthInfo.feeX128;
    // }

    // function clear(mapping(int24 => GrowthInfo) storage self, int24 tick) internal {
    //     delete self[tick];
    // }

    // /// @dev all values in this function are scaled by 2^128 (X128), thus adding the suffix to external params
    // /// @return feeGrowthInsideX128 this value can underflow per Tick.feeGrowthOutside specs
    // function getFeeGrowthInsideX128(
    //     mapping(int24 => GrowthInfo) storage self,
    //     int24 lowerTick,
    //     int24 upperTick,
    //     int24 currentTick,
    //     uint256 feeGrowthGlobalX128
    // ) internal view returns (uint256 feeGrowthInsideX128) {
    //     uint256 lowerFeeGrowthOutside = self[lowerTick].feeX128;
    //     uint256 upperFeeGrowthOutside = self[upperTick].feeX128;

    //     uint256 feeGrowthBelow = currentTick >= lowerTick
    //         ? lowerFeeGrowthOutside
    //         : feeGrowthGlobalX128 - lowerFeeGrowthOutside;
    //     uint256 feeGrowthAbove = currentTick < upperTick
    //         ? upperFeeGrowthOutside
    //         : feeGrowthGlobalX128 - upperFeeGrowthOutside;

    //     return feeGrowthGlobalX128 - feeGrowthBelow - feeGrowthAbove;
    // }
}

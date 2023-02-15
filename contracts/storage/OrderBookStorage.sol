// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change OrderBookStorageV1. Create a new
/// contract which implements OrderBookStorageV1 and following the naming convention
/// OrderBookStorageVX.
abstract contract OrderBookStorageV1 {
    address internal _exchange;

    address[10] private __gap1;
    uint256[10] private __gap2;
}

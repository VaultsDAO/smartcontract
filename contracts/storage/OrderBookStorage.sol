// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { Tick } from "../lib/Tick.sol";
import { Funding } from "../lib/Funding.sol";
import { OpenOrder } from "../lib/OpenOrder.sol";

/// @notice For future upgrades, do not change OrderBookStorageV1. Create a new
/// contract which implements OrderBookStorageV1 and following the naming convention
/// OrderBookStorageVX.
abstract contract OrderBookStorageV1 {
    address internal _exchange;
}

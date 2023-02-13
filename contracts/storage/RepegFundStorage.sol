// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change RepegFundStorageV1. Create a new
/// contract which implements InsuranceFundStorageV1 and following the naming convention
/// InsuranceFundStorageVX.
abstract contract RepegFundStorage {
    // --------- IMMUTABLE ---------

    address internal _token;

    // --------- ^^^^^^^^^ ---------

    address internal _clearingHouse;
    address internal _accountBalance;

    //
    int256 _accumulatedFund;
    int256 _distributedFund;

    address[10] private __gap1;
    uint256[10] private __gap2;
}

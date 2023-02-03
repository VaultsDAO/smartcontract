// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { OwnerPausable } from "./base/OwnerPausable.sol";
import { IRewardMiner } from "./interface/IRewardMiner.sol";
import { BlockContext } from "./base/BlockContext.sol";
import "hardhat/console.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract RewardMiner is IRewardMiner, BlockContext, OwnerPausable {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;

    address internal _clearingHouseConfig;
    address internal _pnftToken;
    uint256 internal _periodDuration;

    //
    // STRUCT
    //

    //
    // EXTERNAL NON-VIEW
    //

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(address clearingHouseArg, address pnftTokenArg, uint256 periodDurationArg) public initializer {
        // ClearingHouse address is not contract
        _isContract(clearingHouseArg, "RM_CHNC");
        _isContract(pnftTokenArg, "RM_PTNC");
        require(periodDurationArg > 0, "RM_PDZ");

        __OwnerPausable_init();

        _clearingHouseConfig = clearingHouseArg;
        _pnftToken = pnftTokenArg;
        _periodDuration = periodDurationArg;
    }

    function _isContract(address contractArg, string memory errorMsg) internal view {
        require(contractArg.isContract(), errorMsg);
    }

    function mint(address trader, uint256 amount) external override {}
}

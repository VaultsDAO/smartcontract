// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { PerpSafeCast } from "./lib/PerpSafeCast.sol";
import { PerpMath } from "./lib/PerpMath.sol";
import { OwnerPausable } from "./base/OwnerPausable.sol";
import { IClearingHouse } from "./interface/IClearingHouse.sol";
import { IAccountBalance } from "./interface/IAccountBalance.sol";
import { IRepegFund } from "./interface/IRepegFund.sol";
import { BlockContext } from "./base/BlockContext.sol";
import { RepegFundStorage } from "./storage/RepegFundStorage.sol";
import "hardhat/console.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract RepegFund is IRepegFund, BlockContext, OwnerPausable, RepegFundStorage {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;
    using PerpMath for uint256;
    using PerpMath for int256;

    //
    // EXTERNAL NON-VIEW
    //

    function _requireOnlyAccountBalance() internal view {
        // only AccountBalance
        require(_msgSender() == _accountBalance, "RF_OAB");
    }

    function _requireOnlyClearingHouse() internal view {
        // only AccountBalance
        require(_msgSender() == _clearingHouse, "RF_OCH");
    }

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(address accountBalanceArg, address clearingHouseArg) public initializer {
        // AccountBalance address is not contract
        _isContract(accountBalanceArg, "RF_ABNC");
        _isContract(clearingHouseArg, "RF_CHNC");

        __OwnerPausable_init();

        _accountBalance = accountBalanceArg;
        _clearingHouse = clearingHouseArg;
    }

    function _isContract(address contractArg, string memory errorMsg) internal view {
        require(contractArg.isContract(), errorMsg);
    }

    function setAccountBalance(address accountBalanceArg) external {
        _isContract(accountBalanceArg, "RF_CHNC");
        _accountBalance = accountBalanceArg;
    }

    function setClearingHouse(address clearingHouseArg) external {
        _isContract(clearingHouseArg, "RF_CHNC");
        _clearingHouse = clearingHouseArg;
    }

    //
    function getAccumulatedFund() external view override returns (int256) {
        return _accumulatedFund;
    }

    function getNeedRealizedPnlFund() external view override returns (int256 fund) {
        if (_distributedFund < 0) {
            (int256 owedRealizedPnl, , ) = IAccountBalance(_accountBalance).getPnlAndPendingFee(address(this));
            fund = _distributedFund.neg256().sub(owedRealizedPnl);
        }
    }

    function getDistributeFund() external view override returns (int256) {
        return _distributedFund;
    }

    // internal function

    function _addFund(uint256 fund) internal {
        _accumulatedFund = _accumulatedFund.add(fund.toInt256());
    }

    function _distributeFund(int256 fund) internal {
        _distributedFund = _distributedFund.add(fund);
        // RF_LF: limit fund
        require(_distributedFund <= _accumulatedFund, "RF_LF");
    }

    // external function

    function addFund(uint256 fund) external override {
        _requireOnlyClearingHouse();
        _addFund(fund);
    }

    function distributeFund(int256 fund) external override {
        _requireOnlyClearingHouse();
        _distributeFund(fund);
    }
}

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
import { IRewardMiner } from "./interface/IRewardMiner.sol";
import { BlockContext } from "./base/BlockContext.sol";
import "hardhat/console.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract RewardMiner is IRewardMiner, BlockContext, OwnerPausable {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;
    using PerpMath for uint256;
    using PerpMath for int256;

    event Mint(address trader, uint256 amount);
    event Spend(address trader, uint256 amount);

    //
    // STRUCT
    //

    struct PeriodConfig {
        uint256 start;
        uint256 end;
        uint256 total;
    }

    struct PeriodData {
        uint256 periodNumber;
        mapping(address => uint256) users;
        uint256 amount;
        uint256 total;
    }
    //
    address internal _clearingHouse;
    address internal _pnftToken;
    uint256 internal _start;
    uint256 internal _periodDuration;
    uint256 internal _limitClaimPeriod;
    PeriodConfig[] public _periodConfigs;
    //
    mapping(uint256 => PeriodData) public _periodDataMap;
    uint256[] public _periodNumbers;
    uint256 internal _allocation;
    uint256 internal _spend;
    mapping(address => uint256) public _lastClaimPeriodNumberMap;

    //
    // EXTERNAL NON-VIEW
    //

    function _requireOnlyClearingHouse() internal view {
        // only ClearingHouse
        require(_msgSender() == _clearingHouse, "RM_OCH");
    }

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address clearingHouseArg,
        address pnftTokenArg,
        uint256 periodDurationArg,
        uint256[] memory starts,
        uint256[] memory ends,
        uint256[] memory totals,
        uint256 limitClaimPeriodArg
    ) public initializer {
        // ClearingHouse address is not contract
        // _isContract(clearingHouseArg, "RM_CHNC");
        _isContract(pnftTokenArg, "RM_PTNC");
        require(periodDurationArg > 0, "RM_PDZ");
        require(starts.length == ends.length && ends.length == totals.length, "RM_IL");

        __OwnerPausable_init();

        _clearingHouse = clearingHouseArg;
        _pnftToken = pnftTokenArg;
        _periodDuration = periodDurationArg;
        _limitClaimPeriod = limitClaimPeriodArg;

        for (uint256 i = 0; i < ends.length; i++) {
            // RM_ISE: invalid start end
            require(starts[i] <= ends[i], "RM_ISE");
            if (i > 0) {
                // RM_IS: invalid start
                require(starts[i] > starts[i - 1], "RM_IS");
            }
            // RM_IT: invalid total
            require(totals[i] > 0, "RM_IT");
            PeriodConfig memory cfg = PeriodConfig({ start: starts[i], end: ends[i], total: totals[i] });
            _periodConfigs.push(cfg);
        }
    }

    function _isContract(address contractArg, string memory errorMsg) internal view {
        require(contractArg.isContract(), errorMsg);
    }

    function setClearingHouse(address clearingHouseArg) external {
        _isContract(clearingHouseArg, "RM_CHNC");
        _clearingHouse = clearingHouseArg;
    }

    // function setPnftToken(address pnftTokenArg) external {
    //     _isContract(pnftTokenArg, "RM_PTNC");
    //     _pnftToken = pnftTokenArg;
    // }

    function setLimitClaimPeriod(uint256 limitClaimPeriodArg) external {
        _limitClaimPeriod = limitClaimPeriodArg;
    }

    function getAllocation() external view returns (uint256 allocation) {
        allocation = _allocation;
    }

    function getSpend() external view returns (uint256 spend) {
        spend = _spend;
    }

    function getCurrentPeriodInfo()
        internal
        view
        returns (uint256 periodNumber, uint256 start, uint256 end, uint256 total, uint256 amount)
    {
        periodNumber = _getPeriodNumber();
        (start, end, total, amount) = _getPeriodInfo(periodNumber);
    }

    function _getPeriodInfo(
        uint256 periodNumber
    ) internal view returns (uint256 start, uint256 end, uint256 total, uint256 amount) {
        require(_blockTimestamp() >= _start, "RM_IT");
        PeriodData storage periodData = _periodDataMap[periodNumber];
        if (periodData.periodNumber != 0) {
            total = periodData.total;
            amount = periodData.total;
        } else {
            for (uint256 i = 0; i < _periodConfigs.length; i++) {
                PeriodConfig memory cfg = _periodConfigs[i];
                if (cfg.start <= periodNumber && periodNumber <= cfg.end) {
                    total = cfg.total;
                }
            }
        }
        start = _start + (periodNumber - 1) * _periodDuration;
        end = start + _periodDuration;
    }

    function getStart() external view returns (uint256 start) {
        start = _start;
    }

    function getPeriodDuration() external view returns (uint256 periodDuration) {
        periodDuration = _periodDuration;
    }

    function getPeriodNumber() external view returns (uint256 periodNumber) {
        return _getPeriodNumber();
    }

    function _getPeriodNumber() internal view returns (uint256 periodNumber) {
        uint256 timestamp = _blockTimestamp();
        require(timestamp >= _start, "RM_IT");
        periodNumber = timestamp.sub(_start).div(_periodDuration).add(1);
    }

    function _createPeriodData() internal returns (PeriodData storage periodData) {
        uint256 periodNumber = _getPeriodNumber();
        periodData = _periodDataMap[periodNumber];
        if (periodData.periodNumber == 0) {
            (, , uint256 total, ) = _getPeriodInfo(periodNumber);
            if (total > 0) {
                // periodData
                periodData.periodNumber = periodNumber;
                periodData.total = total;
                _periodNumbers.push(periodData.periodNumber);
                // _allocation
                _allocation = _allocation.add(total);
            }
        }
    }

    function getClaimable(address trader) external view returns (uint256 amount) {
        return _getClaimable(trader);
    }

    function _getClaimable(address trader) internal view returns (uint256 amount) {
        uint256 periodNumber = _getPeriodNumber();
        uint256 lastPeriodNumber = _lastClaimPeriodNumberMap[trader];
        if (_periodNumbers.length > 0) {
            int256 endPeriod = 0;
            if (_limitClaimPeriod > 0 && (_periodNumbers.length - 1).toInt256() >= _limitClaimPeriod.toInt256()) {
                endPeriod = (_periodNumbers.length - 1).toInt256().sub(_limitClaimPeriod.toInt256());
            }
            for (int256 i = (_periodNumbers.length - 1).toInt256(); i >= endPeriod; i--) {
                PeriodData storage periodData = _periodDataMap[_periodNumbers[uint256(i)]];
                if (
                    periodData.amount > 0 &&
                    periodData.periodNumber < periodNumber &&
                    periodData.periodNumber > lastPeriodNumber
                ) {
                    amount = amount.add(periodData.users[trader].mul(periodData.total).div(periodData.amount));
                }
                if (periodData.periodNumber <= lastPeriodNumber) {
                    break;
                }
            }
        }
    }

    function startMiner(uint256 startArg) external onlyOwner {
        // RM_SZ: start zero
        require(_start == 0, "RM_SZ");
        // RM_IT: invalid time
        require(startArg >= _blockTimestamp(), "RM_IT");
        _start = startArg;
    }

    function mint(address trader, uint256 amount) external override {
        _requireOnlyClearingHouse();
        if (_start > 0) {
            PeriodData storage periodData = _createPeriodData();
            if (periodData.total > 0) {
                periodData.users[trader] = periodData.users[trader].add(amount);
                periodData.amount = periodData.amount.add(amount);
                emit Mint(trader, amount);
            }
        }
    }

    function _claim(address trader) internal returns (uint256 amount) {
        amount = _getClaimable(trader);
        //
        _spend = _spend.add(amount);
        // transfer reward
        IERC20Upgradeable(_pnftToken).transfer(trader, amount);
        // update last claim period
        _lastClaimPeriodNumberMap[trader] = (_getPeriodNumber() - 1);

        emit Spend(trader, amount);
    }

    function claim() external returns (uint256 amount) {
        return _claim(_msgSender());
    }

    function emergencyWithdraw(uint256 amount) external onlyOwner {
        IERC20Upgradeable(_pnftToken).transfer(_msgSender(), amount);
    }
}

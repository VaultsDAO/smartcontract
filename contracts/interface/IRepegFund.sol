// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface IRepegFund {
    function getAccumulatedFund() external view returns (int256);

    function getDistributeFund() external view returns (int256);

    function getNeedRealizedPnlFund() external view returns (int256);

    function addFund(uint256 fund) external;

    function distributeFund(int256 fund) external;
}

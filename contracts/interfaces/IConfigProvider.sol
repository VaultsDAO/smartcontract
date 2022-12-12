// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

/**
 * @title IConfigProvider contract
 * @dev Main registry of addresses part of or connected to the protocol, including permissioned roles
 * - Acting also as factory of proxies and admin of those, so with right to change its implementations
 **/
interface IConfigProvider {
    function owner() external view returns (address);

    /// @notice nftOracle
    function nftOracle() external view returns (address);

    /// @notice reserveOracle
    function reserveOracle() external view returns (address);

    function userClaimRegistry() external view returns (address);

    function bnftRegistry() external view returns (address);

    function shopFactory() external view returns (address);

    function loanManager() external view returns (address);

    //tien phat toi thieu theo % reserve price (ex : vay eth, setup 2% => phat 1*2/100 = 0.02 eth, 1 la ty le giua dong vay voi ETH) khi redeem nft bi auction
    function minBidFine() external view returns (uint256);

    //tien phat toi thieu theo % khoan vay khi redeem nft bi auction ex: vay 10 ETH, setup 5% => phat 10*5/100=0.5 ETH
    function redeemFine() external view returns (uint256);

    //time for borrower can redeem nft although kicked auction (hour)
    function redeemDuration() external view returns (uint256);

    function auctionDuration() external view returns (uint256);

    // auction fee base on final bid price
    function auctionFeePercentage() external view returns (uint256);

    //time for lender can re-buy nft after auction end (hour)
    function rebuyDuration() external view returns (uint256);

    function rebuyFeePercentage() external view returns (uint256);

    function liquidationThreshold() external view returns (uint256);

    //% giam gia khi thanh ly tai san
    function liquidationBonus() external view returns (uint256);

    function redeemThreshold() external view returns (uint256);

    function maxLoanDuration() external view returns (uint256);

    function platformFeeReceiver() external view returns (address);

    //platform fee tinh theo pricipal
    function platformFeePercentage() external view returns (uint256);

    //block time to calculate interest
    function interestDuration() external view returns (uint256);

    function minBidDeltaPercentage() external view returns (uint256);
}

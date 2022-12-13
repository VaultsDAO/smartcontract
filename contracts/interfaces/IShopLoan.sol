// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {DataTypes} from "../libraries/types/DataTypes.sol";

interface IShopLoan {
    /**
     * @dev Emitted on initialization to share location of dependent notes
     * @param pool The address of the associated lend pool
     */
    event Initialized(address indexed pool);

    /**
     * @dev Emitted when a loan is created
     * @param user The address initiating the action
     */
    event LoanCreated(
        address indexed user,
        uint256 indexed loanId,
        address nftAsset,
        uint256 nftTokenId,
        address reserveAsset,
        uint256 amount
    );

    /**
     * @dev Emitted when a loan is updated
     * @param user The address initiating the action
     */
    event LoanPartialRepay(
        address indexed user,
        uint256 indexed loanId,
        address nftAsset,
        uint256 nftTokenId,
        address reserveAsset,
        uint256 repayAmount,
        uint256 currentInterest
    );

    /**
     * @dev Emitted when a loan is repaid by the borrower
     * @param user The address initiating the action
     */
    event LoanRepaid(
        address indexed user,
        uint256 indexed loanId,
        address nftAsset,
        uint256 nftTokenId,
        address reserveAsset,
        uint256 amount
    );

    /**
     * @dev Emitted when a loan is auction by the liquidator
     * @param user The address initiating the action
     */
    event LoanAuctioned(
        address indexed user,
        uint256 indexed loanId,
        address nftAsset,
        uint256 nftTokenId,
        uint256 amount,
        address bidder,
        uint256 price,
        address previousBidder,
        uint256 previousPrice
    );

    /**
     * @dev Emitted when a loan is redeemed
     * @param user The address initiating the action
     */
    event LoanRedeemed(
        address indexed user,
        uint256 indexed loanId,
        address nftAsset,
        uint256 nftTokenId,
        address reserveAsset,
        uint256 amountTaken
    );

    /**
     * @dev Emitted when a loan is liquidate by the liquidator
     * @param user The address initiating the action
     */
    event LoanLiquidated(
        address indexed user,
        uint256 indexed loanId,
        address nftAsset,
        uint256 nftTokenId,
        address reserveAsset,
        uint256 amount
    );

    /**
     * @dev Emitted when shop owner rebuy liquidated loan from liquidator
     */
    event LoanRebuyLiquidated(
        uint256 indexed loanId,
        address nftAsset,
        uint256 nftTokenId,
        address reserveAsset,
        uint256 rebuyPrice
    );

    function initNft(address nftAsset) external;

    /**
     * @dev Create store a loan object with some params
     * @param initiator The address of the user initiating the borrow
     */
    function createLoan(
        uint256 shopId,
        address initiator,
        address nftAsset,
        uint256 nftTokenId,
        address reserveAsset,
        uint256 amount,
        uint256 interestRate
    ) external returns (uint256);

    /**
     * @dev Update the given loan with some params
     *
     * Requirements:
     *  - The caller must be a holder of the loan
     *  - The loan must be in state Active
     * @param initiator The address of the user initiating the borrow
     */
    function partialRepayLoan(
        address initiator,
        uint256 loanId,
        uint256 repayAmount
    ) external;

    /**
     * @dev Repay the given loan
     *
     * Requirements:
     *  - The caller must be a holder of the loan
     *  - The caller must send in principal + interest
     *  - The loan must be in state Active
     *
     * @param initiator The address of the user initiating the repay
     * @param loanId The loan getting burned
     */
    function repayLoan(
        address initiator,
        uint256 loanId,
        uint256 amount
    ) external;

    /**
     * @dev Auction the given loan
     *
     * Requirements:
     *  - The price must be greater than current highest price
     *  - The loan must be in state Active or Auction
     *
     * @param initiator The address of the user initiating the auction
     * @param loanId The loan getting auctioned
     * @param bidPrice The bid price of this auction
     */
    function auctionLoan(
        address initiator,
        uint256 loanId,
        address onBehalfOf,
        uint256 bidPrice,
        uint256 borrowAmount
    ) external;

    // /**
    //  * @dev Redeem the given loan with some params
    //  *
    //  * Requirements:
    //  *  - The caller must be a holder of the loan
    //  *  - The loan must be in state Auction
    //  * @param initiator The address of the user initiating the borrow
    //  */
    function redeemLoan(
        address initiator,
        uint256 loanId,
        uint256 amountTaken
    )
        external
        returns (
            uint256 remainAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        );

    /**
     * @dev Liquidate the given loan
     *
     * Requirements:
     *  - The caller must send in principal + interest
     *  - The loan must be in state Active
     *
     * @param initiator The address of the user initiating the auction
     * @param loanId The loan getting burned
     */
    function liquidateLoan(
        address initiator,
        uint256 loanId,
        uint256 borrowAmount
    ) external;

    function borrowerOf(uint256 loanId) external view returns (address);

    function getCollateralLoanId(
        address nftAsset,
        uint256 nftTokenId
    ) external view returns (uint256);

    function getLoan(
        uint256 loanId
    ) external view returns (DataTypes.LoanData memory loanData);

    function totalDebtInReserve(
        uint256 loanId,
        uint256 repayAmount
    )
        external
        view
        returns (
            address asset,
            uint256 borrowAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        );

    function getLoanHighestBid(
        uint256 loanId
    ) external view returns (address, uint256);

    function rebuyLiquidateLoan(uint256 loanId, uint256 rebuyPrice) external;

    /**
     * @dev Returns the debt data of the NFT
     * @return nftAsset the address of the NFT
     * @return nftTokenId nft token ID
     * @return reserveAsset the address of the Reserve
     * @return totalCollateral the total power of the NFT
     * @return totalDebt the total debt of the NFT
     * @return healthFactor the current health factor of the NFT
     **/
    function getNftDebtData(
        uint256 loanId
    )
        external
        view
        returns (
            address nftAsset,
            uint256 nftTokenId,
            address reserveAsset,
            uint256 totalCollateral,
            uint256 totalDebt,
            uint256 healthFactor
        );

    /**
     * @dev Returns the auction data of the NFT
     * @param loanId the loan id of the NFT
     * @return nftAsset The address of the NFT
     * @return nftTokenId The token id of the NFT
     * @return bidderAddress the highest bidder address of the loan
     * @return bidPrice the highest bid price in Reserve of the loan
     * @return bidBorrowAmount the borrow amount in Reserve of the loan
     * @return bidFine the penalty fine of the loan
     **/
    function getNftAuctionData(
        uint256 loanId
    )
        external
        view
        returns (
            address nftAsset,
            uint256 nftTokenId,
            address bidderAddress,
            uint256 bidPrice,
            uint256 bidBorrowAmount,
            uint256 bidFine
        );

    function getNftLiquidatePrice(
        uint256 loanId
    ) external view returns (uint256 liquidatePrice, uint256 paybackAmount);

    function getRebuyAmount(
        uint256 loanId
    ) external view returns (uint256 rebuyPrice, uint256 payAmount);
}

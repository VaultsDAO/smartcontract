// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

library DataTypes {
    struct ShopData {
        uint256 id;
        address creator;
    }

    struct ReservesInfo {
        uint8 id;
        address contractAddress;
        bool active;
        string symbol;
        uint256 decimals;
    }
    struct NftsInfo {
        uint8 id;
        bool active;
        address contractAddress;
        string collection;
        uint256 maxSupply;
    }

    enum LoanState {
        // We need a default that is not 'Created' - this is the zero value
        None,
        // The loan data is stored, but not initiated yet.
        Created,
        // The loan has been initialized, funds have been delivered to the borrower and the collateral is held.
        Active,
        // The loan is in auction, higest price liquidator will got chance to claim it.
        Auction,
        // The loan has been repaid, and the collateral has been returned to the borrower. This is a terminal state.
        Repaid,
        // The loan was delinquent and collateral claimed by the liquidator. This is a terminal state.
        Defaulted
    }
    struct LoanData {
        uint256 shopId;
        //the id of the nft loan
        uint256 loanId;
        //the current state of the loan
        LoanState state;
        //address of borrower
        address borrower;
        //address of nft asset token
        address nftAsset;
        //the id of nft token
        uint256 nftTokenId;
        //address of reserve asset token
        address reserveAsset;
        //borrow amount
        uint256 borrowAmount;
        //start time of first bid time
        uint256 bidStartTimestamp;
        //bidder address of higest bid
        address bidderAddress;
        //price of higest bid
        uint256 bidPrice;
        //borrow amount of loan
        uint256 bidBorrowAmount;
        //bidder address of first bid
        address firstBidderAddress;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 lastRepaidAt;
        uint256 expiredAt;
        uint256 interestRate;
    }

    struct GlobalConfiguration {
        //bit 0-15: LTV
        //bit 16-31: Liq. threshold
        //bit 32: Active
        uint256 data;
    }

    struct ShopConfiguration {
        //bit 0-15: LTV
        //bit 16-31: Liq. threshold
        //bit 32: Active
        uint256 data;
    }

    struct ExecuteLendPoolStates {
        uint256 pauseStartTime;
        uint256 pauseDurationTime;
    }

    struct ExecuteBorrowParams {
        address initiator;
        address asset;
        uint256 amount;
        address nftAsset;
        uint256 nftTokenId;
        address onBehalfOf;
    }
    struct ExecuteBatchBorrowParams {
        address initiator;
        address[] assets;
        uint256[] amounts;
        address[] nftAssets;
        uint256[] nftTokenIds;
        address onBehalfOf;
    }
    struct ExecuteRepayParams {
        address initiator;
        uint256 loanId;
        uint256 amount;
        address shopCreator;
    }

    struct ExecuteBatchRepayParams {
        address initiator;
        uint256[] loanIds;
        uint256[] amounts;
        address shopCreator;
    }
    struct ExecuteAuctionParams {
        address initiator;
        uint256 loanId;
        uint256 bidPrice;
        address onBehalfOf;
    }

    struct ExecuteRedeemParams {
        address initiator;
        uint256 loanId;
        uint256 amount;
        uint256 bidFine;
        address shopCreator;
    }

    struct ExecuteLiquidateParams {
        address initiator;
        uint256 loanId;
        address shopCreator;
    }

    struct ShopConfigParams {
        address reserveAddress;
        address nftAddress;
        uint256 interestRate;
        uint256 ltvRate;
        bool active;
    }
}

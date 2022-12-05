// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {PercentageMath} from "../math/PercentageMath.sol";
import {Errors} from "../helpers/Errors.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {IShopLoan} from "../../interfaces/IShopLoan.sol";

import {IERC20Upgradeable} from "../../openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "../../openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {GenericLogic} from "./GenericLogic.sol";
import {ShopConfiguration} from "../configuration/ShopConfiguration.sol";
import {IConfigProvider} from "../../interfaces/IConfigProvider.sol";

/**
 * @title ValidationLogic library
 * @notice Implements functions to validate the different actions of the protocol
 */
library ValidationLogic {
    using PercentageMath for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ShopConfiguration for DataTypes.ShopConfiguration;
    struct ValidateBorrowLocalVars {
        uint256 currentLtv;
        uint256 currentLiquidationThreshold;
        uint256 amountOfCollateralNeeded;
        uint256 userCollateralBalance;
        uint256 userBorrowBalance;
        uint256 availableLiquidity;
        uint256 healthFactor;
        bool isActive;
        address loanReserveAsset;
        address loanBorrower;
    }

    /**
     * @dev Validates a borrow action
     * @param reserveAsset The address of the asset to borrow
     * @param amount The amount to be borrowed
     * @param reserveData The reserve state from which the user is borrowing
     */
    function validateBorrow(
        IConfigProvider provider,
        DataTypes.ShopConfiguration storage config,
        address user,
        address reserveAsset,
        uint256 amount,
        DataTypes.ReservesInfo storage reserveData,
        address nftAsset,
        address loanAddress,
        uint256 loanId,
        address reserveOracle,
        address nftOracle
    ) external view {
        ValidateBorrowLocalVars memory vars;

        require(amount > 0, Errors.VL_INVALID_AMOUNT);

        if (loanId != 0) {
            DataTypes.LoanData memory loanData = IShopLoan(loanAddress).getLoan(
                loanId
            );

            require(
                loanData.state == DataTypes.LoanState.Active,
                Errors.LPL_INVALID_LOAN_STATE
            );
            require(
                reserveAsset == loanData.reserveAsset,
                Errors.VL_SPECIFIED_RESERVE_NOT_BORROWED_BY_USER
            );
            require(
                user == loanData.borrower,
                Errors.VL_SPECIFIED_LOAN_NOT_BORROWED_BY_USER
            );
        }

        vars.isActive = config.getActive();
        require(vars.isActive, Errors.VL_NO_ACTIVE_RESERVE);

        vars.currentLtv = config.getLtv();
        vars.currentLiquidationThreshold = provider.liquidationThreshold();
        (
            vars.userCollateralBalance,
            vars.userBorrowBalance,
            vars.healthFactor
        ) = GenericLogic.calculateLoanData(
            provider,
            config,
            reserveAsset,
            reserveData,
            nftAsset,
            loanAddress,
            loanId,
            reserveOracle,
            nftOracle
        );

        require(
            vars.userCollateralBalance > 0,
            Errors.VL_COLLATERAL_BALANCE_IS_0
        );

        require(
            vars.healthFactor >
                GenericLogic.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.VL_HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );

        //add the current already borrowed amount to the amount requested to calculate the total collateral needed.
        //LTV is calculated in percentage
        vars.amountOfCollateralNeeded = (vars.userBorrowBalance + amount)
            .percentDiv(vars.currentLtv);

        require(
            vars.amountOfCollateralNeeded <= vars.userCollateralBalance,
            Errors.VL_COLLATERAL_CANNOT_COVER_NEW_BORROW
        );
    }

    /**
     * @dev Validates a repay action
     * @param reserveData The reserve state from which the user is repaying
     * @param amountSent The amount sent for the repayment. Can be an actual value or uint(-1)
     * @param borrowAmount The borrow balance of the user
     */
    function validateRepay(
        DataTypes.ReservesInfo storage reserveData,
        DataTypes.LoanData memory loanData,
        uint256 amountSent,
        uint256 borrowAmount
    ) external view {
        require(
            reserveData.contractAddress != address(0),
            Errors.VL_INVALID_RESERVE_ADDRESS
        );

        require(amountSent > 0, Errors.VL_INVALID_AMOUNT);

        require(borrowAmount > 0, Errors.VL_NO_DEBT_OF_SELECTED_TYPE);

        require(
            loanData.state == DataTypes.LoanState.Active,
            Errors.LPL_INVALID_LOAN_STATE
        );
    }

    /**
     * @dev Validates the auction action
     * @param reserveData The reserve data of the principal
     * @param nftData The nft data of the underlying nft
     * @param bidPrice Total variable debt balance of the user
     **/
    function validateAuction(
        DataTypes.ReservesInfo storage reserveData,
        DataTypes.NftsInfo storage nftData,
        DataTypes.LoanData memory loanData,
        uint256 bidPrice
    ) internal view {
        require(reserveData.active, Errors.VL_NO_ACTIVE_RESERVE);

        require(nftData.active, Errors.VL_NO_ACTIVE_NFT);

        require(
            loanData.state == DataTypes.LoanState.Active ||
                loanData.state == DataTypes.LoanState.Auction,
            Errors.LPL_INVALID_LOAN_STATE
        );

        require(bidPrice > 0, Errors.VL_INVALID_AMOUNT);
    }

    /**
     * @dev Validates a redeem action
     * @param reserveData The reserve state
     * @param nftData The nft state
     */
    function validateRedeem(
        DataTypes.ReservesInfo storage reserveData,
        DataTypes.NftsInfo storage nftData,
        DataTypes.LoanData memory loanData,
        uint256 amount
    ) external view {
        require(reserveData.active, Errors.VL_NO_ACTIVE_RESERVE);

        require(nftData.active, Errors.VL_NO_ACTIVE_NFT);

        require(
            loanData.state == DataTypes.LoanState.Auction,
            Errors.LPL_INVALID_LOAN_STATE
        );

        require(
            loanData.bidderAddress != address(0),
            Errors.LPL_INVALID_BIDDER_ADDRESS
        );

        require(amount > 0, Errors.VL_INVALID_AMOUNT);
    }

    /**
     * @dev Validates the liquidation action
     * @param reserveData The reserve data of the principal
     * @param nftData The data of the underlying NFT
     * @param loanData The loan data of the underlying NFT
     **/
    function validateLiquidate(
        DataTypes.ReservesInfo storage reserveData,
        DataTypes.NftsInfo storage nftData,
        DataTypes.LoanData memory loanData
    ) internal view {
        // require(
        //     nftData.bNftAddress != address(0),
        //     Errors.LPC_INVALIED_BNFT_ADDRESS
        // );
        // require(
        //     reserveData.bTokenAddress != address(0),
        //     Errors.VL_INVALID_RESERVE_ADDRESS
        // );

        require(reserveData.active, Errors.VL_NO_ACTIVE_RESERVE);

        require(nftData.active, Errors.VL_NO_ACTIVE_NFT);

        require(
            loanData.state == DataTypes.LoanState.Auction,
            Errors.LPL_INVALID_LOAN_STATE
        );

        require(
            loanData.bidderAddress != address(0),
            Errors.LPL_INVALID_BIDDER_ADDRESS
        );
    }
}

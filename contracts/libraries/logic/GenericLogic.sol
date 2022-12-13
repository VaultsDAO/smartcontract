// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {IShopLoan} from "../../interfaces/IShopLoan.sol";
import {INFTOracleGetter} from "../../interfaces/INFTOracleGetter.sol";
import {IReserveOracleGetter} from "../../interfaces/IReserveOracleGetter.sol";
import {IBNFTRegistry} from "../../interfaces/IBNFTRegistry.sol";
import {PercentageMath} from "../math/PercentageMath.sol";
import {SafeMath} from "../math/SafeMath.sol";
import {Errors} from "../helpers/Errors.sol";
import {DataTypes} from "../types/DataTypes.sol";

import {ShopConfiguration} from "../configuration/ShopConfiguration.sol";
import {IConfigProvider} from "../../interfaces/IConfigProvider.sol";

/**
 * @title GenericLogic library
 * @notice Implements protocol-level logic to calculate and validate the state of a user
 */
library GenericLogic {
    using PercentageMath for uint256;
    using SafeMath for uint256;
    using ShopConfiguration for DataTypes.ShopConfiguration;
    uint256 public constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1 ether;

    struct CalculateLoanDataVars {
        uint256 reserveUnitPrice;
        uint256 reserveUnit;
        uint256 reserveDecimals;
        uint256 healthFactor;
        uint256 totalCollateralInETH;
        uint256 totalCollateralInReserve;
        uint256 totalDebtInETH;
        uint256 totalDebtInReserve;
        uint256 nftLtv;
        uint256 nftLiquidationThreshold;
        address nftAsset;
        uint256 nftTokenId;
        uint256 nftUnitPrice;
    }

    /**
     * @dev Calculates the nft loan data.
     * this includes the total collateral/borrow balances in Reserve,
     * the Loan To Value, the Liquidation Ratio, and the Health factor.
     * @param reserveData Data of the reserve
     * @param reserveOracle The price oracle address of reserve
     * @param nftOracle The price oracle address of nft
     * @return The total collateral and total debt of the loan in Reserve, the ltv, liquidation threshold and the HF
     **/
    function calculateLoanData(
        IConfigProvider provider,
        DataTypes.ShopConfiguration storage config,
        address reserveAddress,
        DataTypes.ReservesInfo storage reserveData,
        address nftAddress,
        address loanAddress,
        uint256 loanId,
        address reserveOracle,
        address nftOracle
    ) internal view returns (uint256, uint256, uint256) {
        CalculateLoanDataVars memory vars;

        vars.nftLtv = config.getLtv();
        vars.nftLiquidationThreshold = provider.liquidationThreshold();

        // calculate total borrow balance for the loan
        if (loanId != 0) {
            (
                vars.totalDebtInETH,
                vars.totalDebtInReserve
            ) = calculateNftDebtData(
                reserveAddress,
                reserveData,
                loanAddress,
                loanId,
                reserveOracle
            );
        }

        // calculate total collateral balance for the nft
        (
            vars.totalCollateralInETH,
            vars.totalCollateralInReserve
        ) = calculateNftCollateralData(
            reserveAddress,
            reserveData,
            nftAddress,
            reserveOracle,
            nftOracle
        );

        // calculate health by borrow and collateral
        vars.healthFactor = calculateHealthFactorFromBalances(
            vars.totalCollateralInReserve,
            vars.totalDebtInReserve,
            vars.nftLiquidationThreshold
        );

        return (
            vars.totalCollateralInReserve,
            vars.totalDebtInReserve,
            vars.healthFactor
        );
    }

    function calculateNftDebtData(
        address reserveAddress,
        DataTypes.ReservesInfo storage reserveData,
        address loanAddress,
        uint256 loanId,
        address reserveOracle
    ) internal view returns (uint256, uint256) {
        CalculateLoanDataVars memory vars;

        // all asset price has converted to ETH based, unit is in WEI (18 decimals)

        vars.reserveDecimals = reserveData.decimals;
        vars.reserveUnit = 10 ** vars.reserveDecimals;

        vars.reserveUnitPrice = IReserveOracleGetter(reserveOracle)
            .getAssetPrice(reserveAddress);

        (, uint256 borrowAmount, , uint256 interest, uint256 fee) = IShopLoan(
            loanAddress
        ).totalDebtInReserve(loanId, 0);
        vars.totalDebtInReserve = borrowAmount + interest + fee;
        vars.totalDebtInETH =
            (vars.totalDebtInReserve * vars.reserveUnitPrice) /
            vars.reserveUnit;

        return (vars.totalDebtInETH, vars.totalDebtInReserve);
    }

    function calculateNftCollateralData(
        address reserveAddress,
        DataTypes.ReservesInfo storage reserveData,
        address nftAddress,
        address reserveOracle,
        address nftOracle
    ) internal view returns (uint256, uint256) {
        CalculateLoanDataVars memory vars;

        vars.nftUnitPrice = INFTOracleGetter(nftOracle).getAssetPrice(
            nftAddress
        );
        vars.totalCollateralInETH = vars.nftUnitPrice;

        if (reserveAddress != address(0)) {
            vars.reserveDecimals = reserveData.decimals;
            vars.reserveUnit = 10 ** vars.reserveDecimals;

            vars.reserveUnitPrice = IReserveOracleGetter(reserveOracle)
                .getAssetPrice(reserveAddress);

            vars.totalCollateralInReserve =
                (vars.totalCollateralInETH * vars.reserveUnit) /
                vars.reserveUnitPrice;
        }

        return (vars.totalCollateralInETH, vars.totalCollateralInReserve);
    }

    /**
     * @dev Calculates the health factor from the corresponding balances
     * @param totalCollateral The total collateral
     * @param totalDebt The total debt
     * @param liquidationThreshold The avg liquidation threshold
     * @return The health factor calculated from the balances provided
     **/
    function calculateHealthFactorFromBalances(
        uint256 totalCollateral,
        uint256 totalDebt,
        uint256 liquidationThreshold
    ) internal pure returns (uint256) {
        if (totalDebt == 0) return type(uint256).max;

        return (totalCollateral.percentMul(liquidationThreshold)) / totalDebt;
    }

    struct CalculateInterestInfoVars {
        uint256 lastRepaidAt;
        uint256 borrowAmount;
        uint256 interestRate;
        uint256 repayAmount;
        uint256 platformFeeRate;
        uint256 interestDuration;
    }

    function calculateInterestInfo(
        CalculateInterestInfoVars memory vars
    )
        internal
        view
        returns (
            uint256 totalDebt,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 platformFee
        )
    {
        if (vars.interestDuration == 0) {
            vars.interestDuration = 86400; //1day
        }
        uint256 sofarLoanDay = (
            (block.timestamp - vars.lastRepaidAt).div(vars.interestDuration)
        ).add(1);
        interest = vars
            .borrowAmount
            .mul(vars.interestRate)
            .mul(sofarLoanDay)
            .div(uint256(10000))
            .div(uint256(365 * 86400) / vars.interestDuration);
        platformFee = vars.borrowAmount.mul(vars.platformFeeRate).div(10000);
        if (vars.repayAmount > 0) {
            require(
                vars.repayAmount > interest,
                Errors.LP_REPAY_AMOUNT_NOT_ENOUGH
            );
            repayPrincipal = vars.repayAmount - interest;
            if (repayPrincipal >= vars.borrowAmount.add(platformFee)) {
                repayPrincipal = vars.borrowAmount;
            } else {
                repayPrincipal = repayPrincipal.mul(10000).div(
                    10000 + vars.platformFeeRate
                );
                platformFee = vars.repayAmount - interest - repayPrincipal;
            }
        }
        totalDebt = vars.borrowAmount.add(interest).add(platformFee);
        return (totalDebt, repayPrincipal, interest, platformFee);
    }

    struct CalcLiquidatePriceLocalVars {
        uint256 ltv;
        uint256 liquidationThreshold;
        uint256 liquidationBonus;
        uint256 nftPriceInETH;
        uint256 nftPriceInReserve;
        uint256 reserveDecimals;
        uint256 reservePriceInETH;
        uint256 thresholdPrice;
        uint256 liquidatePrice;
        uint256 totalDebt;
        uint256 repayPrincipal;
        uint256 interest;
        uint256 platformFee;
        uint256 auctionFee;
    }

    function calculateLoanLiquidatePrice(
        IConfigProvider provider,
        uint256 loanId,
        address reserveAsset,
        DataTypes.ReservesInfo storage reserveData,
        address nftAsset
    ) internal view returns (uint256, uint256, uint256, uint256, uint256) {
        CalcLiquidatePriceLocalVars memory vars;

        vars.reserveDecimals = reserveData.decimals;

        DataTypes.LoanData memory loan = IShopLoan(provider.loanManager())
            .getLoan(loanId);
        (
            vars.totalDebt,
            ,
            vars.interest,
            vars.platformFee
        ) = calculateInterestInfo(
            CalculateInterestInfoVars({
                lastRepaidAt: loan.lastRepaidAt,
                borrowAmount: loan.borrowAmount,
                interestRate: loan.interestRate,
                repayAmount: 0,
                platformFeeRate: provider.platformFeePercentage(),
                interestDuration: provider.interestDuration()
            })
        );

        //does not calculate interest after auction
        if (
            loan.state == DataTypes.LoanState.Auction &&
            loan.bidBorrowAmount > 0
        ) {
            vars.totalDebt = loan.bidBorrowAmount;
            vars.auctionFee = loan
                .bidBorrowAmount
                .mul(provider.auctionFeePercentage())
                .div(uint256(10000));
        }

        vars.liquidationThreshold = provider.liquidationThreshold();
        vars.liquidationBonus = provider.liquidationBonus();

        require(
            vars.liquidationThreshold > 0,
            Errors.LP_INVALID_LIQUIDATION_THRESHOLD
        );

        vars.nftPriceInETH = INFTOracleGetter(provider.nftOracle())
            .getAssetPrice(nftAsset);
        vars.reservePriceInETH = IReserveOracleGetter(provider.reserveOracle())
            .getAssetPrice(reserveAsset);

        vars.nftPriceInReserve =
            ((10 ** vars.reserveDecimals) * vars.nftPriceInETH) /
            vars.reservePriceInETH;

        vars.thresholdPrice = vars.nftPriceInReserve.percentMul(
            vars.liquidationThreshold
        );

        vars.liquidatePrice = vars.nftPriceInReserve.percentMul(
            PercentageMath.PERCENTAGE_FACTOR - vars.liquidationBonus
        );

        return (
            vars.totalDebt,
            vars.thresholdPrice,
            vars.liquidatePrice,
            vars.platformFee,
            vars.auctionFee
        );
    }

    struct CalcLoanBidFineLocalVars {
        uint256 reserveDecimals;
        uint256 reservePriceInETH;
        uint256 baseBidFineInReserve;
        uint256 minBidFinePct;
        uint256 minBidFineInReserve;
        uint256 bidFineInReserve;
        uint256 debtAmount;
    }

    function calculateLoanBidFine(
        IConfigProvider provider,
        address reserveAsset,
        DataTypes.ReservesInfo storage reserveData,
        address nftAsset,
        DataTypes.LoanData memory loanData,
        address poolLoan,
        address reserveOracle
    ) internal view returns (uint256, uint256) {
        nftAsset;

        if (loanData.bidPrice == 0) {
            return (0, 0);
        }

        CalcLoanBidFineLocalVars memory vars;

        vars.reserveDecimals = reserveData.decimals;
        vars.reservePriceInETH = IReserveOracleGetter(reserveOracle)
            .getAssetPrice(reserveAsset);
        vars.baseBidFineInReserve =
            (1 ether * 10 ** vars.reserveDecimals) /
            vars.reservePriceInETH;

        vars.minBidFinePct = provider.minBidFine();
        vars.minBidFineInReserve = vars.baseBidFineInReserve.percentMul(
            vars.minBidFinePct
        );

        (, uint256 borrowAmount, , uint256 interest, uint256 fee) = IShopLoan(
            poolLoan
        ).totalDebtInReserve(loanData.loanId, 0);

        vars.debtAmount = borrowAmount + interest + fee;

        vars.bidFineInReserve = vars.debtAmount.percentMul(
            provider.redeemFine()
        );
        if (vars.bidFineInReserve < vars.minBidFineInReserve) {
            vars.bidFineInReserve = vars.minBidFineInReserve;
        }

        return (vars.minBidFineInReserve, vars.bidFineInReserve);
    }

    function calculateLoanAuctionEndTimestamp(
        IConfigProvider provider,
        uint256 bidStartTimestamp
    )
        internal
        view
        returns (uint256 auctionEndTimestamp, uint256 redeemEndTimestamp)
    {
        auctionEndTimestamp = bidStartTimestamp + provider.auctionDuration();

        redeemEndTimestamp = bidStartTimestamp + provider.redeemDuration();
    }

    /**
     * @dev Calculates the equivalent amount that an user can borrow, depending on the available collateral and the
     * average Loan To Value
     * @param totalCollateral The total collateral
     * @param totalDebt The total borrow balance
     * @param ltv The average loan to value
     * @return the amount available to borrow for the user
     **/

    function calculateAvailableBorrows(
        uint256 totalCollateral,
        uint256 totalDebt,
        uint256 ltv
    ) internal pure returns (uint256) {
        uint256 availableBorrows = totalCollateral.percentMul(ltv);

        if (availableBorrows < totalDebt) {
            return 0;
        }

        availableBorrows = availableBorrows - totalDebt;
        return availableBorrows;
    }

    function getBNftAddress(
        IConfigProvider provider,
        address nftAsset
    ) internal view returns (address bNftAddress) {
        IBNFTRegistry bnftRegistry = IBNFTRegistry(provider.bnftRegistry());
        bNftAddress = bnftRegistry.getBNFTAddresses(nftAsset);
        return bNftAddress;
    }

    function isWETHAddress(
        IConfigProvider provider,
        address asset
    ) internal view returns (bool) {
        return asset == IReserveOracleGetter(provider.reserveOracle()).weth();
    }

    function getWETHAddress(
        IConfigProvider provider
    ) internal view returns (address) {
        return IReserveOracleGetter(provider.reserveOracle()).weth();
    }

    struct CalcRebuyAmountVars {
        uint256 bidPrice;
        uint256 totalDebt;
        uint256 rebuyAmount;
        uint256 payAmount;
        uint256 platformFee;
    }

    function calculateRebuyAmount(
        IConfigProvider provider,
        uint256 loanId
    ) internal view returns (uint256, uint256) {
        CalcRebuyAmountVars memory vars;

        DataTypes.LoanData memory loan = IShopLoan(provider.loanManager())
            .getLoan(loanId);
        require(
            loan.state == DataTypes.LoanState.Auction &&
                loan.bidBorrowAmount > 0,
            Errors.LPL_INVALID_LOAN_STATE
        );
        (vars.totalDebt, , , vars.platformFee) = calculateInterestInfo(
            CalculateInterestInfoVars({
                lastRepaidAt: loan.lastRepaidAt,
                borrowAmount: loan.borrowAmount,
                interestRate: loan.interestRate,
                repayAmount: 0,
                platformFeeRate: provider.platformFeePercentage(),
                interestDuration: provider.interestDuration()
            })
        );

        //rebuy amount  = winamount * (1 + 5%)
        vars.rebuyAmount = loan.bidPrice.percentMul(
            PercentageMath.PERCENTAGE_FACTOR + provider.rebuyFeePercentage()
        );
        vars.payAmount = vars.rebuyAmount.sub(vars.totalDebt).add(
            vars.platformFee
        );

        return (vars.rebuyAmount, vars.payAmount);
    }
}

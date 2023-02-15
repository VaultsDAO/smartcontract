// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;
import { IAccountBalance } from "../interface/IAccountBalance.sol";
import { ICollateralManager } from "../interface/ICollateralManager.sol";
import { IBaseToken } from "../interface/IBaseToken.sol";
import { IClearingHouse } from "../interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "../interface/IClearingHouseConfig.sol";
import { IOrderBook } from "../interface/IOrderBook.sol";
import { IExchange } from "../interface/IExchange.sol";
import { IVault } from "../interface/IVault.sol";
import { IIndexPrice } from "../interface/IIndexPrice.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { PerpSafeCast } from "./PerpSafeCast.sol";
import { PerpMath } from "./PerpMath.sol";
import { SettlementTokenMath } from "./SettlementTokenMath.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { DataTypes } from "../types/DataTypes.sol";
import { IERC20Metadata } from "../interface/IERC20Metadata.sol";
import { MathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "hardhat/console.sol";

library VaultLogic {
    using SafeMathUpgradeable for uint256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;
    using SignedSafeMathUpgradeable for int256;
    using SettlementTokenMath for uint256;
    using SettlementTokenMath for int256;
    using PerpMath for int256;
    using PerpMath for uint256;
    using PerpMath for uint24;
    using FullMath for uint256;

    uint24 private constant _ONE_HUNDRED_PERCENT_RATIO = 1e6;

    function isCollateral(address vaultAddress, address token) public view returns (bool) {
        return ICollateralManager(IVault(vaultAddress).getCollateralManager()).isCollateral(token);
    }

    /// @notice Get the specified trader's settlement token balance, including pending fee, funding payment,
    ///         owed realized PnL, but without unrealized PnL)
    /// @dev Note the difference between the return argument`settlementTokenBalanceX10_18` and
    ///      the return value of `getSettlementTokenValue()`.
    ///      The first one is settlement token balance with pending fee, funding payment, owed realized PnL;
    ///      The second one is the first one plus unrealized PnL.
    /// @return settlementTokenBalanceX10_18 Settlement amount in 18 decimals
    /// @return unrealizedPnlX10_18 Unrealized PnL in 18 decimals
    function getSettlementTokenBalanceAndUnrealizedPnl(
        address vaultAddress,
        address trader
    ) public view returns (int256 settlementTokenBalanceX10_18, int256 unrealizedPnlX10_18) {
        int256 fundingPaymentX10_18 = IExchange(IVault(vaultAddress).getExchange()).getAllPendingFundingPayment(trader);

        int256 owedRealizedPnlX10_18;
        uint256 pendingFeeX10_18;
        (owedRealizedPnlX10_18, unrealizedPnlX10_18, pendingFeeX10_18) = IAccountBalance(
            IVault(vaultAddress).getAccountBalance()
        ).getPnlAndPendingFee(trader);

        settlementTokenBalanceX10_18 = IVault(vaultAddress)
            .getBalance(trader)
            .parseSettlementToken(IVault(vaultAddress).decimals())
            .add(pendingFeeX10_18.toInt256().sub(fundingPaymentX10_18).add(owedRealizedPnlX10_18));

        return (settlementTokenBalanceX10_18, unrealizedPnlX10_18);
    }

    function getSettlementTokenValue(
        address vaultAddress,
        address trader
    ) public view returns (int256 settlementTokenValueX10_18) {
        (int256 settlementBalanceX10_18, int256 unrealizedPnlX10_18) = getSettlementTokenBalanceAndUnrealizedPnl(
            vaultAddress,
            trader
        );
        return settlementBalanceX10_18.add(unrealizedPnlX10_18);
    }

    function getTotalMarginRequirement(
        address vaultAddress,
        address trader,
        uint24 ratio
    ) public view returns (uint256 totalMarginRequirementX10_18) {
        // uint256 totalDebtValueX10_18 = IAccountBalance(_accountBalance).getTotalDebtValue(trader);
        uint256 totalDebtValueX10_18 = IAccountBalance(IVault(vaultAddress).getAccountBalance())
            .getTotalAbsPositionValue(trader);
        return totalDebtValueX10_18.mulRatio(ratio);
    }

    /// @notice Get the maximum value denominated in settlement token when liquidating a trader's collateral tokens
    /// @dev formula:
    ///      maxDebt = max(max(-settlementTokenValue, 0), openOrderReq)
    ///      maxRepaidSettlementWithoutInsuranceFundFee =
    ///          maxDebt > collateralValueDustThreshold ? maxDebt * liquidationRatio : maxDebt
    ///      maxRepaidSettlement = maxRepaidSettlementWithoutInsuranceFundFee / (1 - IFRatio)
    /// @return maxRepaidSettlementX10_18 max repaid settlement token in 18 decimals
    function getMaxRepaidSettlement(
        address vaultAddress,
        address trader
    ) public view returns (uint256 maxRepaidSettlementX10_18) {
        // max(max(-settlementTokenValue, 0), totalMarginReq) * liquidationRatio
        int256 settlementTokenValueX10_18 = getSettlementTokenValue(vaultAddress, trader);
        uint256 settlementTokenDebtX10_18 = settlementTokenValueX10_18 < 0
            ? settlementTokenValueX10_18.neg256().toUint256()
            : 0;

        uint256 totalMarginRequirementX10_18 = getTotalMarginRequirement(
            vaultAddress,
            trader,
            IClearingHouseConfig(IVault(vaultAddress).getClearingHouseConfig()).getImRatio()
        );

        uint256 maxDebtX10_18 = MathUpgradeable.max(settlementTokenDebtX10_18, totalMarginRequirementX10_18);
        uint256 collateralValueDustX10_18 = ICollateralManager(IVault(vaultAddress).getCollateralManager())
            .getCollateralValueDust()
            .parseSettlementToken(IVault(vaultAddress).decimals());
        uint256 maxRepaidSettlementWithoutInsuranceFundFeeX10_18 = maxDebtX10_18 > collateralValueDustX10_18
            ? maxDebtX10_18.mulRatio(
                ICollateralManager(IVault(vaultAddress).getCollateralManager()).getLiquidationRatio()
            )
            : maxDebtX10_18;

        return
            maxRepaidSettlementWithoutInsuranceFundFeeX10_18.divRatio(
                _ONE_HUNDRED_PERCENT_RATIO.subRatio(
                    ICollateralManager(IVault(vaultAddress).getCollateralManager()).getCLInsuranceFundFeeRatio()
                )
            );
    }

    function getIndexPriceAndDecimals(address vaultAddress, address token) public view returns (uint256, uint8) {
        return (
            ICollateralManager(IVault(vaultAddress).getCollateralManager()).getPrice(
                token,
                IClearingHouseConfig(IVault(vaultAddress).getClearingHouseConfig()).getTwapInterval()
            ),
            ICollateralManager(IVault(vaultAddress).getCollateralManager()).getPriceFeedDecimals(token)
        );
    }

    function getTokenDecimals(address token) public view returns (uint8) {
        return IERC20Metadata(token).decimals();
    }

    function getCollateralBySettlement(
        address token,
        uint256 settlementX10_18,
        uint256 price,
        uint8 priceFeedDecimals
    ) public view returns (uint256 collateral) {
        uint8 collateralTokenDecimals = getTokenDecimals(token);

        // Convert token decimals with as much precision as possible
        return
            collateralTokenDecimals > 18
                ? settlementX10_18.convertTokenDecimals(18, collateralTokenDecimals).mulDivRoundingUp(
                    10 ** priceFeedDecimals,
                    price
                )
                : settlementX10_18.mulDivRoundingUp(10 ** priceFeedDecimals, price).convertTokenDecimals(
                    18,
                    collateralTokenDecimals
                );
    }

    function getSettlementByCollateral(
        address token,
        uint256 collateral,
        uint256 price,
        uint8 priceFeedDecimals
    ) public view returns (uint256 settlementX10_18) {
        uint8 collateralTokenDecimals = getTokenDecimals(token);

        // Convert token decimals with as much precision as possible
        return
            collateralTokenDecimals > 18
                ? collateral.mulDiv(price, 10 ** priceFeedDecimals).convertTokenDecimals(collateralTokenDecimals, 18)
                : collateral.convertTokenDecimals(collateralTokenDecimals, 18).mulDiv(price, 10 ** priceFeedDecimals);
    }

    function getMaxRepaidSettlementAndLiquidatableCollateral(
        address vaultAddress,
        address trader,
        address token
    ) public view returns (uint256 maxRepaidSettlementX10_S, uint256 maxLiquidatableCollateral) {
        // V_TINAC: token is not a collateral
        require(isCollateral(vaultAddress, token), "V_TINAC");

        uint256 maxRepaidSettlementX10_18 = getMaxRepaidSettlement(vaultAddress, trader);
        uint24 discountRatio = ICollateralManager(IVault(vaultAddress).getCollateralManager())
            .getCollateralConfig(token)
            .discountRatio;
        (uint256 indexTwap, uint8 priceFeedDecimals) = getIndexPriceAndDecimals(vaultAddress, token);

        uint256 discountedIndexTwap = indexTwap.mulRatio(_ONE_HUNDRED_PERCENT_RATIO.subRatio(discountRatio));
        maxLiquidatableCollateral = getCollateralBySettlement(
            token,
            maxRepaidSettlementX10_18,
            discountedIndexTwap,
            priceFeedDecimals
        );

        uint256 tokenBalance = IVault(vaultAddress).getBalanceByToken(trader, token).toUint256();
        if (maxLiquidatableCollateral > tokenBalance) {
            maxLiquidatableCollateral = tokenBalance;

            // Deliberately rounding down when calculating settlement. Thus, when calculating
            // collateral with settlement, the result is always <= maxCollateral.
            // This makes sure that collateral will always be <= user's collateral balance.
            maxRepaidSettlementX10_18 = getSettlementByCollateral(
                token,
                maxLiquidatableCollateral,
                discountedIndexTwap,
                priceFeedDecimals
            );
        }

        maxRepaidSettlementX10_S = maxRepaidSettlementX10_18.formatSettlementToken(IVault(vaultAddress).decimals());

        return (maxRepaidSettlementX10_S, maxLiquidatableCollateral);
    }

    function getCollateralValue(
        address vaultAddress,
        address trader,
        address token
    ) internal view returns (uint256 collateralValueX10_18) {
        int256 tokenBalance = IVault(vaultAddress).getBalanceByToken(trader, token);
        (uint256 indexTwap, uint8 priceFeedDecimals) = getIndexPriceAndDecimals(vaultAddress, token);
        return getSettlementByCollateral(token, tokenBalance.toUint256(), indexTwap, priceFeedDecimals);
    }

    function getNonSettlementTokenValue(
        address vaultAddress,
        address trader,
        address[] memory collateralTokens
    ) public view returns (uint256 nonSettlementTokenValueX10_18) {
        uint256 tokenLen = collateralTokens.length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address token = collateralTokens[i];
            uint256 collateralValueX10_18 = getCollateralValue(vaultAddress, trader, token);
            uint24 collateralRatio = ICollateralManager(IVault(vaultAddress).getCollateralManager())
                .getCollateralConfig(token)
                .collateralRatio;

            nonSettlementTokenValueX10_18 = nonSettlementTokenValueX10_18.add(
                collateralValueX10_18.mulRatio(collateralRatio)
            );
        }

        return nonSettlementTokenValueX10_18;
    }

    function getTotalCollateralValueAndUnrealizedPnl(
        address vaultAddress,
        address trader,
        address[] memory collateralTokens
    ) public view returns (int256 totalCollateralValueX10_18, int256 unrealizedPnlX10_18) {
        int256 settlementTokenBalanceX10_18;
        (settlementTokenBalanceX10_18, unrealizedPnlX10_18) = getSettlementTokenBalanceAndUnrealizedPnl(
            vaultAddress,
            trader
        );
        uint256 nonSettlementTokenValueX10_18 = getNonSettlementTokenValue(vaultAddress, trader, collateralTokens);
        return (nonSettlementTokenValueX10_18.toInt256().add(settlementTokenBalanceX10_18), unrealizedPnlX10_18);
    }

    function getAccountValueAndTotalCollateralValue(
        address vaultAddress,
        address trader,
        address[] memory collateralTokens
    ) public view returns (int256 accountValueX10_18, int256 totalCollateralValueX10_18) {
        int256 unrealizedPnlX10_18;

        (totalCollateralValueX10_18, unrealizedPnlX10_18) = getTotalCollateralValueAndUnrealizedPnl(
            vaultAddress,
            trader,
            collateralTokens
        );

        // accountValue = totalCollateralValue + totalUnrealizedPnl, in 18 decimals
        accountValueX10_18 = totalCollateralValueX10_18.add(unrealizedPnlX10_18);

        return (accountValueX10_18, totalCollateralValueX10_18);
    }

    function isLiquidatable(
        address vaultAddress,
        address trader,
        address[] memory collateralTokens
    ) public view returns (bool) {
        if (collateralTokens.length == 0) {
            return false;
        }

        (int256 accountValueX10_18, ) = getAccountValueAndTotalCollateralValue(vaultAddress, trader, collateralTokens);
        if (accountValueX10_18 < IVault(vaultAddress).getMarginRequirementForCollateralLiquidation(trader)) {
            return true;
        }

        int256 settlementTokenValueX10_18 = getSettlementTokenValue(vaultAddress, trader);
        uint256 settlementTokenDebtX10_18 = settlementTokenValueX10_18 < 0
            ? settlementTokenValueX10_18.neg256().toUint256()
            : 0;

        if (
            settlementTokenDebtX10_18 >
            getNonSettlementTokenValue(vaultAddress, trader, collateralTokens).mulRatio(
                ICollateralManager(IVault(vaultAddress).getCollateralManager()).getDebtNonSettlementTokenValueRatio()
            )
        ) {
            return true;
        }

        if (
            settlementTokenDebtX10_18.formatSettlementToken(IVault(vaultAddress).decimals()) >
            ICollateralManager(IVault(vaultAddress).getCollateralManager()).getDebtThresholdByTrader(trader)
        ) {
            return true;
        }

        return false;
    }
}

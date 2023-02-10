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
import { OpenOrder } from "../lib/OpenOrder.sol";
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

    function _isCollateral(address vaultAddress, address token) internal view returns (bool) {
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
    function _getSettlementTokenBalanceAndUnrealizedPnl(
        address vaultAddress,
        address trader
    ) internal view returns (int256 settlementTokenBalanceX10_18, int256 unrealizedPnlX10_18) {
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

    /// @return settlementTokenValueX10_18 settlementTokenBalance + totalUnrealizedPnl, in 18 decimals
    function _getSettlementTokenValue(
        address vaultAddress,
        address trader
    ) internal view returns (int256 settlementTokenValueX10_18) {
        (int256 settlementBalanceX10_18, int256 unrealizedPnlX10_18) = _getSettlementTokenBalanceAndUnrealizedPnl(
            vaultAddress,
            trader
        );
        return settlementBalanceX10_18.add(unrealizedPnlX10_18);
    }

    /// @return totalMarginRequirementX10_18 total margin requirement in 18 decimals
    function _getTotalMarginRequirement(
        address vaultAddress,
        address trader,
        uint24 ratio
    ) internal view returns (uint256 totalMarginRequirementX10_18) {
        uint256 totalDebtValueX10_18 = IAccountBalance(IVault(vaultAddress).getAccountBalance()).getTotalDebtValue(
            trader
        );
        return totalDebtValueX10_18.mulRatio(ratio);
    }

    /// @notice Get the maximum value denominated in settlement token when liquidating a trader's collateral tokens
    /// @dev formula:
    ///      maxDebt = max(max(-settlementTokenValue, 0), openOrderReq)
    ///      maxRepaidSettlementWithoutInsuranceFundFee =
    ///          maxDebt > collateralValueDustThreshold ? maxDebt * liquidationRatio : maxDebt
    ///      maxRepaidSettlement = maxRepaidSettlementWithoutInsuranceFundFee / (1 - IFRatio)
    /// @return maxRepaidSettlementX10_18 max repaid settlement token in 18 decimals
    function _getMaxRepaidSettlement(
        address vaultAddress,
        address trader
    ) internal view returns (uint256 maxRepaidSettlementX10_18) {
        // max(max(-settlementTokenValue, 0), totalMarginReq) * liquidationRatio
        int256 settlementTokenValueX10_18 = _getSettlementTokenValue(vaultAddress, trader);
        uint256 settlementTokenDebtX10_18 = settlementTokenValueX10_18 < 0
            ? settlementTokenValueX10_18.neg256().toUint256()
            : 0;

        uint256 totalMarginRequirementX10_18 = _getTotalMarginRequirement(
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

    function _getIndexPriceAndDecimals(address vaultAddress, address token) internal view returns (uint256, uint8) {
        return (
            ICollateralManager(IVault(vaultAddress).getCollateralManager()).getPrice(
                token,
                IClearingHouseConfig(IVault(vaultAddress).getClearingHouseConfig()).getTwapInterval()
            ),
            ICollateralManager(IVault(vaultAddress).getCollateralManager()).getPriceFeedDecimals(token)
        );
    }

    /// @return collateral collateral amount
    function _getCollateralBySettlement(
        address token,
        uint256 settlementX10_18,
        uint256 price,
        uint8 priceFeedDecimals
    ) internal view returns (uint256 collateral) {
        uint8 collateralTokenDecimals = IERC20Metadata(token).decimals();

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

    /// @return settlementX10_18 collateral value in 18 decimals
    function _getSettlementByCollateral(
        address token,
        uint256 collateral,
        uint256 price,
        uint8 priceFeedDecimals
    ) internal view returns (uint256 settlementX10_18) {
        uint8 collateralTokenDecimals = IERC20Metadata(token).decimals();

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
        require(_isCollateral(vaultAddress, token), "V_TINAC");

        uint256 maxRepaidSettlementX10_18 = _getMaxRepaidSettlement(vaultAddress, trader);
        uint24 discountRatio = ICollateralManager(IVault(vaultAddress).getCollateralManager())
            .getCollateralConfig(token)
            .discountRatio;
        (uint256 indexTwap, uint8 priceFeedDecimals) = _getIndexPriceAndDecimals(vaultAddress, token);

        uint256 discountedIndexTwap = indexTwap.mulRatio(_ONE_HUNDRED_PERCENT_RATIO.subRatio(discountRatio));
        maxLiquidatableCollateral = _getCollateralBySettlement(
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
            maxRepaidSettlementX10_18 = _getSettlementByCollateral(
                token,
                maxLiquidatableCollateral,
                discountedIndexTwap,
                priceFeedDecimals
            );
        }

        maxRepaidSettlementX10_S = maxRepaidSettlementX10_18.formatSettlementToken(IVault(vaultAddress).decimals());

        return (maxRepaidSettlementX10_S, maxLiquidatableCollateral);
    }

    function _getFreeCollateral(
        address vaultAddress,
        address trader
    ) internal view returns (uint256 freeCollateralX10_18) {
        return
            PerpMath
                .max(
                    _getFreeCollateralByRatio(
                        vaultAddress,
                        trader,
                        IClearingHouseConfig(IVault(vaultAddress).getClearingHouseConfig()).getImRatio()
                    ),
                    0
                )
                .toUint256();
    }

    /// @return collateralValueX10_18 collateral value in 18 decimals
    function _getCollateralValue(
        address vaultAddress,
        address trader,
        address token
    ) internal view returns (uint256 collateralValueX10_18) {
        int256 tokenBalance = IVault(vaultAddress).getBalanceByToken(trader, token);
        (uint256 indexTwap, uint8 priceFeedDecimals) = _getIndexPriceAndDecimals(vaultAddress, token);
        return _getSettlementByCollateral(token, tokenBalance.toUint256(), indexTwap, priceFeedDecimals);
    }

    /// @return nonSettlementTokenValueX10_18 total non-settlement token value in 18 decimals
    function _getNonSettlementTokenValue(
        address vaultAddress,
        address trader
    ) internal view returns (uint256 nonSettlementTokenValueX10_18) {
        address[] memory collateralTokens = IVault(vaultAddress).getCollateralTokens(trader);
        uint256 tokenLen = collateralTokens.length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address token = collateralTokens[i];
            uint256 collateralValueX10_18 = _getCollateralValue(vaultAddress, trader, token);
            uint24 collateralRatio = ICollateralManager(IVault(vaultAddress).getCollateralManager())
                .getCollateralConfig(token)
                .collateralRatio;

            nonSettlementTokenValueX10_18 = nonSettlementTokenValueX10_18.add(
                collateralValueX10_18.mulRatio(collateralRatio)
            );
        }

        return nonSettlementTokenValueX10_18;
    }

    function _getTotalCollateralValueAndUnrealizedPnl(
        address vaultAddress,
        address trader
    ) internal view returns (int256 totalCollateralValueX10_18, int256 unrealizedPnlX10_18) {
        int256 settlementTokenBalanceX10_18;
        (settlementTokenBalanceX10_18, unrealizedPnlX10_18) = _getSettlementTokenBalanceAndUnrealizedPnl(
            vaultAddress,
            trader
        );
        uint256 nonSettlementTokenValueX10_18 = _getNonSettlementTokenValue(vaultAddress, trader);
        return (nonSettlementTokenValueX10_18.toInt256().add(settlementTokenBalanceX10_18), unrealizedPnlX10_18);
    }

    function _getAccountValueAndTotalCollateralValue(
        address vaultAddress,
        address trader
    ) internal view returns (int256 accountValueX10_18, int256 totalCollateralValueX10_18) {
        int256 unrealizedPnlX10_18;

        (totalCollateralValueX10_18, unrealizedPnlX10_18) = _getTotalCollateralValueAndUnrealizedPnl(
            vaultAddress,
            trader
        );

        // accountValue = totalCollateralValue + totalUnrealizedPnl, in 18 decimals
        accountValueX10_18 = totalCollateralValueX10_18.add(unrealizedPnlX10_18);

        return (accountValueX10_18, totalCollateralValueX10_18);
    }

    function _getFreeCollateralByRatio(
        address vaultAddress,
        address trader,
        uint24 ratio
    ) internal view returns (int256 freeCollateralX10_18) {
        // conservative config: freeCollateral = min(totalCollateralValue, accountValue) - openOrderMarginReq
        (int256 accountValueX10_18, int256 totalCollateralValueX10_18) = _getAccountValueAndTotalCollateralValue(
            vaultAddress,
            trader
        );
        uint256 totalMarginRequirementX10_18 = _getTotalMarginRequirement(vaultAddress, trader, ratio);

        return
            PerpMath.min(totalCollateralValueX10_18, accountValueX10_18).sub(totalMarginRequirementX10_18.toInt256());

        // moderate config: freeCollateral = min(totalCollateralValue, accountValue - openOrderMarginReq)
        // return
        //     PerpMath.min(
        //         totalCollateralValueX10_18,
        //         accountValueX10_S.sub(totalMarginRequirementX10_18.toInt256())
        //     );

        // aggressive config: freeCollateral = accountValue - openOrderMarginReq
        // note that the aggressive model depends entirely on unrealizedPnl, which depends on the index price
        //      we should implement some sort of safety check before using this model; otherwise,
        //      a trader could drain the entire vault if the index price deviates significantly.
        // return accountValueX10_18.sub(totalMarginRequirementX10_18.toInt256());
    }

    /// @dev getFreeCollateralByToken(token) = (getSettlementTokenValue() >= 0)
    ///   ? min(getFreeCollateral() / indexPrice[token], getBalanceByToken(token))
    ///   : 0
    /// @dev if token is settlementToken, then indexPrice[token] = 1
    function getFreeCollateralByToken(
        address vaultAddress,
        address trader,
        address token
    ) public view returns (uint256) {
        // do not check settlementTokenValue == 0 because user's settlement token balance may be zero
        if (_getSettlementTokenValue(vaultAddress, trader) < 0) {
            return 0;
        }

        uint256 freeCollateralX10_18 = _getFreeCollateral(vaultAddress, trader);
        if (freeCollateralX10_18 == 0) {
            return 0;
        }

        if (token == IVault(vaultAddress).getSettlementToken()) {
            (int256 settlementTokenBalanceX10_18, ) = _getSettlementTokenBalanceAndUnrealizedPnl(vaultAddress, trader);
            return
                settlementTokenBalanceX10_18 <= 0
                    ? 0
                    : MathUpgradeable
                        .min(freeCollateralX10_18, settlementTokenBalanceX10_18.toUint256())
                        .formatSettlementToken(IVault(vaultAddress).decimals());
        }

        (uint256 indexTwap, uint8 priceFeedDecimals) = _getIndexPriceAndDecimals(vaultAddress, token);
        uint24 collateralRatio = ICollateralManager(IVault(vaultAddress).getCollateralManager())
            .getCollateralConfig(token)
            .collateralRatio;
        return
            MathUpgradeable.min(
                _getCollateralBySettlement(token, freeCollateralX10_18, indexTwap, priceFeedDecimals).divRatio(
                    collateralRatio
                ),
                // non-settlement token is always positive number
                IVault(vaultAddress).getBalanceByToken(trader, token).toUint256()
            );
    }

    function isLiquidatable(address vaultAddress, address trader) public view returns (bool) {
        address[] memory collateralTokens = IVault(vaultAddress).getCollateralTokens(trader);
        if (collateralTokens.length == 0) {
            return false;
        }

        (int256 accountValueX10_18, ) = _getAccountValueAndTotalCollateralValue(vaultAddress, trader);
        if (accountValueX10_18 < IVault(vaultAddress).getMarginRequirementForCollateralLiquidation(trader)) {
            return true;
        }

        int256 settlementTokenValueX10_18 = _getSettlementTokenValue(vaultAddress, trader);
        uint256 settlementTokenDebtX10_18 = settlementTokenValueX10_18 < 0
            ? settlementTokenValueX10_18.neg256().toUint256()
            : 0;

        if (
            settlementTokenDebtX10_18 >
            _getNonSettlementTokenValue(vaultAddress, trader).mulRatio(
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

    function getLiquidatableCollateralBySettlement(
        address vaultAddress,
        address token,
        uint256 settlementX10_S
    ) public view returns (uint256 collateral) {
        uint24 discountRatio = ICollateralManager(IVault(vaultAddress).getCollateralManager())
            .getCollateralConfig(token)
            .discountRatio;
        (uint256 indexTwap, uint8 priceFeedDecimals) = _getIndexPriceAndDecimals(vaultAddress, token);

        return
            _getCollateralBySettlement(
                token,
                settlementX10_S.parseSettlementToken(IVault(vaultAddress).decimals()),
                indexTwap.mulRatio(_ONE_HUNDRED_PERCENT_RATIO.subRatio(discountRatio)),
                priceFeedDecimals
            );
    }
}

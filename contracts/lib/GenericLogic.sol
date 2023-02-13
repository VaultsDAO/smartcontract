// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;
import { IAccountBalance } from "../interface/IAccountBalance.sol";
import { IBaseToken } from "../interface/IBaseToken.sol";
import { IIndexPrice } from "../interface/IIndexPrice.sol";
import { IClearingHouse } from "../interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "../interface/IClearingHouseConfig.sol";
import { IOrderBook } from "../interface/IOrderBook.sol";
import { IExchange } from "../interface/IExchange.sol";
import { IVault } from "../interface/IVault.sol";
import { IMarketRegistry } from "../interface/IMarketRegistry.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { PerpSafeCast } from "./PerpSafeCast.sol";
import { PerpMath } from "./PerpMath.sol";
import { SettlementTokenMath } from "./SettlementTokenMath.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { DataTypes } from "../types/DataTypes.sol";
import { OpenOrder } from "../lib/OpenOrder.sol";

import "hardhat/console.sol";

library GenericLogic {
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for uint128;
    using PerpSafeCast for int256;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for uint128;
    using PerpMath for int256;
    using SettlementTokenMath for int256;

    uint256 internal constant _FULLY_CLOSED_RATIO = 1e18;

    //internal struct
    struct InternalCheckSlippageParams {
        bool isBaseToQuote;
        bool isExactInput;
        uint256 base;
        uint256 quote;
        uint256 oppositeAmountBound;
    }
    //event

    event FundingPaymentSettled(address indexed trader, address indexed baseToken, int256 fundingPayment);

    /// @notice Emitted when taker's position is being changed
    /// @param trader Trader address
    /// @param baseToken The address of virtual base token(ETH, BTC, etc...)
    /// @param exchangedPositionSize The actual amount swap to uniswapV3 pool
    /// @param exchangedPositionNotional The cost of position, include fee
    /// @param fee The fee of open/close position
    /// @param openNotional The cost of open/close position, < 0: long, > 0: short
    /// @param realizedPnl The realized Pnl after open/close position
    /// @param sqrtPriceAfterX96 The sqrt price after swap, in X96
    event PositionChanged(
        address indexed trader,
        address indexed baseToken,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        uint256 fee,
        int256 openNotional,
        int256 realizedPnl,
        uint256 sqrtPriceAfterX96
    );

    //event
    event PositionLiquidated(
        address indexed trader,
        address indexed baseToken,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        uint256 fee,
        int256 realizedPnl,
        uint256 sqrtPriceAfterX96,
        address liquidator,
        uint256 liquidatorFee
    );

    /// @notice Emitted when maker's liquidity of a order changed
    /// @param baseToken The address of virtual base token(ETH, BTC, etc...)
    /// @param quoteToken The address of virtual USD token
    /// @param base The amount of base token added (> 0) / removed (< 0) as liquidity; fees not included
    /// @param quote The amount of quote token added ... (same as the above)
    /// @param liquidity The amount of liquidity unit added (> 0) / removed (< 0)
    event LiquidityChanged(
        address indexed baseToken,
        address indexed quoteToken,
        int256 base,
        int256 quote,
        int128 liquidity
    );

    /// @notice Emitted when open position with non-zero referral code
    /// @param referralCode The referral code by partners
    event ReferredPositionChanged(bytes32 indexed referralCode);

    //====================== END Event

    function checkMarketOpen(address baseToken) public view {
        // CH_MNO: Market not opened
        require(IBaseToken(baseToken).isOpen(), "CH_MNO");
    }

    function registerBaseToken(address chAddress, address trader, address baseToken) public {
        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).registerBaseToken(trader, baseToken);
    }

    function settleFundingGlobal(
        address chAddress,
        address baseToken
    ) public returns (DataTypes.Growth memory fundingGrowthGlobal) {
        (fundingGrowthGlobal) = IExchange(IClearingHouse(chAddress).getExchange()).settleFundingGlobal(baseToken);
        return fundingGrowthGlobal;
    }

    function settleFunding(
        address chAddress,
        address trader,
        address baseToken
    ) public returns (DataTypes.Growth memory fundingGrowthGlobal) {
        int256 fundingPayment;
        (fundingPayment, fundingGrowthGlobal) = IExchange(IClearingHouse(chAddress).getExchange()).settleFunding(
            trader,
            baseToken
        );

        if (fundingPayment != 0) {
            IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).modifyOwedRealizedPnl(
                trader,
                fundingPayment.neg256()
            );
            emit FundingPaymentSettled(trader, baseToken, fundingPayment);
        }

        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).updateTwPremiumGrowthGlobal(
            trader,
            baseToken,
            fundingGrowthGlobal.twLongPremiumX96,
            fundingGrowthGlobal.twShortPremiumX96
        );
        return fundingGrowthGlobal;
    }

    function getFreeCollateralByRatio(address chAddress, address trader, uint24 ratio) public view returns (int256) {
        return IVault(IClearingHouse(chAddress).getVault()).getFreeCollateralByRatio(trader, ratio);
    }

    function checkSlippageAfterLiquidityChange(
        uint256 base,
        uint256 minBase,
        uint256 quote,
        uint256 minQuote
    ) public pure {
        // CH_PSCF: price slippage check fails
        require(base >= minBase && quote >= minQuote, "CH_PSCF");
    }

    function getSqrtMarkX96(address chAddress, address baseToken) public view returns (uint160) {
        return IExchange(IClearingHouse(chAddress).getExchange()).getSqrtMarkTwapX96(baseToken, 0);
    }

    function requireEnoughFreeCollateral(address chAddress, address trader) public view {
        if (trader == IClearingHouse(chAddress).getMaker()) return;
        // CH_NEFCI: not enough free collateral by imRatio
        require(
            getFreeCollateralByRatio(
                chAddress,
                trader,
                IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig()).getImRatio()
            ) >= 0,
            "CH_NEFCI"
        );
    }

    function requireEnoughFreeCollateralForClose(address chAddress, address trader) public view {
        if (trader == IClearingHouse(chAddress).getMaker()) return;
        // CH_NEFCM: not enough free collateral by mmRatio
        require(
            getFreeCollateralByRatio(
                chAddress,
                trader,
                IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig()).getMmRatio()
            ) >= 0,
            "CH_NEFCM"
        );
    }

    function getTakerOpenNotional(address chAddress, address trader, address baseToken) public view returns (int256) {
        return IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).getTakerOpenNotional(trader, baseToken);
    }

    function getAccountValue(address chAddress, address trader) public view returns (int256) {
        return
            IVault(IClearingHouse(chAddress).getVault()).getAccountValue(trader).parseSettlementToken(
                IVault(IClearingHouse(chAddress).getVault()).decimals()
            );
    }

    function checkSlippage(InternalCheckSlippageParams memory params) public pure {
        // skip when params.oppositeAmountBound is zero
        if (params.oppositeAmountBound == 0) {
            return;
        }

        // B2Q + exact input, want more output quote as possible, so we set a lower bound of output quote
        // B2Q + exact output, want less input base as possible, so we set a upper bound of input base
        // Q2B + exact input, want more output base as possible, so we set a lower bound of output base
        // Q2B + exact output, want less input quote as possible, so we set a upper bound of input quote
        if (params.isBaseToQuote) {
            if (params.isExactInput) {
                // too little received when short
                require(params.quote >= params.oppositeAmountBound, "CH_TLRS");
            } else {
                // too much requested when short
                require(params.base <= params.oppositeAmountBound, "CH_TMRS");
            }
        } else {
            if (params.isExactInput) {
                // too little received when long
                require(params.base >= params.oppositeAmountBound, "CH_TLRL");
            } else {
                // too much requested when long
                require(params.quote <= params.oppositeAmountBound, "CH_TMRL");
            }
        }
    }

    function getTakerPositionSafe(address chAddress, address trader, address baseToken) public view returns (int256) {
        int256 takerPositionSize = IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).getTakerPositionSize(
            trader,
            baseToken
        );
        // CH_PSZ: position size is zero
        require(takerPositionSize != 0, "CH_PSZ");
        return takerPositionSize;
    }

    function getOppositeAmount(
        address chAddress,
        uint256 oppositeAmountBound,
        bool isPartialClose
    ) internal view returns (uint256) {
        return
            isPartialClose
                ? oppositeAmountBound.mulRatio(
                    IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig()).getPartialCloseRatio()
                )
                : oppositeAmountBound;
    }

    function requireNotMaker(address chAddress, address maker) internal view {
        // not Maker
        require(maker != IClearingHouse(chAddress).getMaker(), "CHD_NM");
    }

    function isLiquidatable(address chAddress, address trader) internal view returns (bool) {
        return
            getAccountValue(chAddress, trader) <
            IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).getMarginRequirementForLiquidation(trader);
    }

    function getLiquidationPenaltyRatio(address chAddress) internal view returns (uint24) {
        return IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig()).getLiquidationPenaltyRatio();
    }

    function getIndexPrice(address chAddress, address baseToken) internal view returns (uint256) {
        return
            IIndexPrice(baseToken).getIndexPrice(
                IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig()).getTwapInterval()
            );
    }

    function getInsuranceFundFeeRatio(
        address exchange,
        address marketRegistry,
        address baseToken,
        bool isBaseToQuote
    ) public view returns (uint256) {
        (, uint256 markTwap, uint256 indexTwap) = IExchange(exchange).getFundingGrowthGlobalAndTwaps(baseToken);
        int256 deltaTwapRatio = (markTwap.toInt256().sub(indexTwap.toInt256())).mulDiv(1e6, indexTwap);
        IMarketRegistry.MarketInfo memory marketInfo = IMarketRegistry(marketRegistry).getMarketInfo(baseToken);
        // delta <= 2.5%
        if (deltaTwapRatio.abs() <= marketInfo.optimalDeltaTwapRatio) {
            return marketInfo.insuranceFundFeeRatio;
        }
        if ((isBaseToQuote && deltaTwapRatio > 0) || (!isBaseToQuote && deltaTwapRatio < 0)) {
            return 0;
        }
        // 2.5% < delta <= 5%
        if (
            marketInfo.optimalDeltaTwapRatio < deltaTwapRatio.abs() &&
            deltaTwapRatio.abs() <= marketInfo.unhealthyDeltaTwapRatio
        ) {
            return deltaTwapRatio.abs().mul(marketInfo.optimalFundingRatio).div(1e6);
        }
        // 5% < delta
        return deltaTwapRatio.abs();
    }

    function getNewPositionSizeForMultiplierRate(
        uint256 longPositionSize,
        uint256 shortPositionSize,
        uint256 oldMarkPrice,
        uint256 newMarkPrice,
        uint256 newDetalPositionSize
    ) internal view returns (uint256 newLongPositionSizeRate, uint256 newShortPositionSizeRate) {
        (uint256 newLongPositionSize, uint256 newShortPositionSize) = getNewPositionSizeForMultiplier(
            longPositionSize,
            shortPositionSize,
            oldMarkPrice,
            newMarkPrice,
            newDetalPositionSize
        );
        newLongPositionSizeRate = longPositionSize != 0 ? newLongPositionSize.divMultiplier(longPositionSize) : 0;
        newShortPositionSizeRate = shortPositionSize != 0 ? newShortPositionSize.divMultiplier(shortPositionSize) : 0;
    }

    function getNewPositionSizeForMultiplier(
        uint256 longPositionSize,
        uint256 shortPositionSize,
        uint256 oldMarkPrice,
        uint256 newMarkPrice,
        uint256 newDetalPositionSize
    ) internal view returns (uint256 newLongPositionSize, uint256 newShortPositionSize) {
        newLongPositionSize = longPositionSize;
        newShortPositionSize = shortPositionSize;

        if ((longPositionSize + shortPositionSize) == 0) {
            return (newLongPositionSize, newShortPositionSize);
        }

        if (longPositionSize == shortPositionSize && oldMarkPrice == newMarkPrice) {
            return (newLongPositionSize, newShortPositionSize);
        }

        if (oldMarkPrice != newMarkPrice) {
            // GL_IP: Invalid Price
            require(oldMarkPrice > 0 && newMarkPrice > 0, "GL_IP");
            newLongPositionSize = FullMath.mulDiv(newLongPositionSize, oldMarkPrice, newMarkPrice);
            newShortPositionSize = FullMath.mulDiv(newShortPositionSize, oldMarkPrice, newMarkPrice);
        }

        uint256 oldDetalPositionSize = newLongPositionSize.toInt256().sub(newShortPositionSize.toInt256()).abs();
        int256 diffDetalPositionSize = newDetalPositionSize.toInt256().sub(oldDetalPositionSize.toInt256());
        uint256 newTotalPositionSize = newLongPositionSize.add(newShortPositionSize);

        if (
            (diffDetalPositionSize > 0 && newLongPositionSize > newShortPositionSize) ||
            (diffDetalPositionSize < 0 && newLongPositionSize < newShortPositionSize)
        ) {
            newLongPositionSize = FullMath.mulDiv(
                newLongPositionSize,
                (1e18 + FullMath.mulDiv(diffDetalPositionSize.abs(), 1e18, newTotalPositionSize)),
                1e18
            );
            newShortPositionSize = FullMath.mulDiv(
                newShortPositionSize,
                (1e18 - FullMath.mulDiv(diffDetalPositionSize.abs(), 1e18, newTotalPositionSize)),
                1e18
            );
        } else if (
            (diffDetalPositionSize > 0 && newLongPositionSize < newShortPositionSize) ||
            (diffDetalPositionSize < 0 && newLongPositionSize > newShortPositionSize)
        ) {
            newLongPositionSize = FullMath.mulDiv(
                newLongPositionSize,
                (1e18 - FullMath.mulDiv(diffDetalPositionSize.abs(), 1e18, newTotalPositionSize)),
                1e18
            );
            newShortPositionSize = FullMath.mulDiv(
                newShortPositionSize,
                (1e18 + FullMath.mulDiv(diffDetalPositionSize.abs(), 1e18, newTotalPositionSize)),
                1e18
            );
        }
        return (newLongPositionSize, newShortPositionSize);
    }

    function getInfoMultiplier(
        address chAddress,
        address baseToken
    )
        internal
        returns (uint256 oldLongPositionSize, uint256 oldShortPositionSize, int256 oldDeltaBase, uint256 deltaQuote)
    {
        (oldLongPositionSize, oldShortPositionSize) = IAccountBalance(IClearingHouse(chAddress).getAccountBalance())
            .getMarketPositionSize(baseToken);
        oldDeltaBase = oldLongPositionSize.toInt256().sub(oldShortPositionSize.toInt256());
        if (oldDeltaBase != 0) {
            bool isBaseToQuote = oldDeltaBase > 0 ? true : false;
            IOrderBook.ReplaySwapResponse memory estimate = IExchange(IClearingHouse(chAddress).getExchange())
                .estimateSwap(
                    DataTypes.OpenPositionParams({
                        baseToken: baseToken,
                        isBaseToQuote: isBaseToQuote,
                        isExactInput: isBaseToQuote,
                        oppositeAmountBound: 0,
                        amount: uint256(oldDeltaBase.abs()),
                        sqrtPriceLimitX96: 0,
                        deadline: block.timestamp + 60,
                        referralCode: ""
                    })
                );
            deltaQuote = isBaseToQuote ? estimate.amountOut : estimate.amountIn;
        }
    }

    function updateInfoMultiplier(
        address chAddress,
        address baseToken,
        uint256 oldLongPositionSize,
        uint256 oldShortPositionSize,
        int256 oldDeltaBase,
        uint256 oldMarkPrice,
        uint256 newMarkPrice,
        uint256 deltaQuote
    ) internal {
        uint256 newDeltaBase;
        if (deltaQuote > 0) {
            bool isBaseToQuote = oldDeltaBase > 0 ? true : false;
            IOrderBook.ReplaySwapResponse memory estimate = IExchange(IClearingHouse(chAddress).getExchange())
                .estimateSwap(
                    DataTypes.OpenPositionParams({
                        baseToken: baseToken,
                        isBaseToQuote: isBaseToQuote,
                        isExactInput: !isBaseToQuote,
                        oppositeAmountBound: 0,
                        amount: deltaQuote,
                        sqrtPriceLimitX96: 0,
                        deadline: block.timestamp + 60,
                        referralCode: ""
                    })
                );
            newDeltaBase = isBaseToQuote ? estimate.amountIn : estimate.amountOut;
        } else {
            newDeltaBase = oldLongPositionSize.toInt256().sub(oldShortPositionSize.toInt256()).abs();
        }

        (uint256 newLongPositionSizeRate, uint256 newShortPositionSizeRate) = GenericLogic
            .getNewPositionSizeForMultiplierRate(
                oldLongPositionSize,
                oldShortPositionSize,
                oldMarkPrice,
                newMarkPrice,
                newDeltaBase
            );

        // console.log("oldDeltaBase %d", oldDeltaBase.abs());
        // console.log("deltaQuote %d", deltaQuote);
        // console.log("newDeltaBase %d", newDeltaBase);
        // console.log("newLongPositionSize %d", newLongPositionSizeRate);
        // console.log("newShortPositionSize %d", newShortPositionSizeRate);

        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).modifyMarketMultiplier(
            baseToken,
            newLongPositionSizeRate,
            newShortPositionSizeRate
        );
    }

    struct InternalRealizePnlParams {
        address trader;
        address baseToken;
        int256 takerPositionSize;
        int256 takerOpenNotional;
        int256 base;
        int256 quote;
    }

    function getPnlToBeRealized(InternalRealizePnlParams memory params) external pure returns (int256) {
        // closedRatio is based on the position size
        uint256 closedRatio = FullMath.mulDiv(params.base.abs(), _FULLY_CLOSED_RATIO, params.takerPositionSize.abs());

        int256 pnlToBeRealized;
        // if closedRatio <= 1, it's reducing or closing a position; else, it's opening a larger reverse position
        if (closedRatio <= _FULLY_CLOSED_RATIO) {
            // https://docs.google.com/spreadsheets/d/1QwN_UZOiASv3dPBP7bNVdLR_GTaZGUrHW3-29ttMbLs/edit#gid=148137350
            // taker:
            // step 1: long 20 base
            // openNotionalFraction = 252.53
            // openNotional = -252.53
            // step 2: short 10 base (reduce half of the position)
            // quote = 137.5
            // closeRatio = 10/20 = 0.5
            // reducedOpenNotional = openNotional * closedRatio = -252.53 * 0.5 = -126.265
            // realizedPnl = quote + reducedOpenNotional = 137.5 + -126.265 = 11.235
            // openNotionalFraction = openNotionalFraction - quote + realizedPnl
            //                      = 252.53 - 137.5 + 11.235 = 126.265
            // openNotional = -openNotionalFraction = 126.265

            // overflow inspection:
            // max closedRatio = 1e18; range of oldOpenNotional = (-2 ^ 255, 2 ^ 255)
            // only overflow when oldOpenNotional < -2 ^ 255 / 1e18 or oldOpenNotional > 2 ^ 255 / 1e18
            int256 reducedOpenNotional = params.takerOpenNotional.mulDiv(closedRatio.toInt256(), _FULLY_CLOSED_RATIO);
            pnlToBeRealized = params.quote.add(reducedOpenNotional);
        } else {
            // https://docs.google.com/spreadsheets/d/1QwN_UZOiASv3dPBP7bNVdLR_GTaZGUrHW3-29ttMbLs/edit#gid=668982944
            // taker:
            // step 1: long 20 base
            // openNotionalFraction = 252.53
            // openNotional = -252.53
            // step 2: short 30 base (open a larger reverse position)
            // quote = 337.5
            // closeRatio = 30/20 = 1.5
            // closedPositionNotional = quote / closeRatio = 337.5 / 1.5 = 225
            // remainsPositionNotional = quote - closedPositionNotional = 337.5 - 225 = 112.5
            // realizedPnl = closedPositionNotional + openNotional = -252.53 + 225 = -27.53
            // openNotionalFraction = openNotionalFraction - quote + realizedPnl
            //                      = 252.53 - 337.5 + -27.53 = -112.5
            // openNotional = -openNotionalFraction = remainsPositionNotional = 112.5

            // overflow inspection:
            // max & min tick = 887272, -887272; max liquidity = 2 ^ 128
            // max quote = 2^128 * (sqrt(1.0001^887272) - sqrt(1.0001^-887272)) = 6.276865796e57 < 2^255 / 1e18
            int256 closedPositionNotional = params.quote.mulDiv(int256(_FULLY_CLOSED_RATIO), closedRatio);
            pnlToBeRealized = params.takerOpenNotional.add(closedPositionNotional);
        }

        return pnlToBeRealized;
    }
}

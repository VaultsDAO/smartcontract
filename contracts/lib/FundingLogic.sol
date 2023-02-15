// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;
import { IAccountBalance } from "../interface/IAccountBalance.sol";
import { IBaseToken } from "../interface/IBaseToken.sol";
import { IClearingHouse } from "../interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "../interface/IClearingHouseConfig.sol";
import { IOrderBook } from "../interface/IOrderBook.sol";
import { IExchange } from "../interface/IExchange.sol";
import { IVault } from "../interface/IVault.sol";
import { IMarketRegistry } from "../interface/IMarketRegistry.sol";
import { IRewardMiner } from "../interface/IRewardMiner.sol";
import { IIndexPrice } from "../interface/IIndexPrice.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { PerpSafeCast } from "./PerpSafeCast.sol";
import { PerpMath } from "./PerpMath.sol";
import { SettlementTokenMath } from "./SettlementTokenMath.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { DataTypes } from "../types/DataTypes.sol";
import { GenericLogic } from "../lib/GenericLogic.sol";
import { UniswapV3Broker } from "../lib/UniswapV3Broker.sol";
import { SwapMath } from "../lib/SwapMath.sol";
import { PerpFixedPoint96 } from "./PerpFixedPoint96.sol";
import "hardhat/console.sol";

library FundingLogic {
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

    /// @dev block-based funding is calculated as: premium * timeFraction / 1 day, for 1 day as the default period
    int256 internal constant _DEFAULT_FUNDING_PERIOD = 1 days;

    //
    // INTERNAL PURE
    //

    function calcPendingFundingPaymentWithLiquidityCoefficient(
        int256 baseBalance,
        int256 twLongPremiumGrowthGlobalX96,
        int256 twShortPremiumGrowthGlobalX96,
        DataTypes.Growth memory fundingGrowthGlobal
    ) public pure returns (int256) {
        int256 balanceCoefficientInFundingPayment = 0;
        if (baseBalance > 0) {
            balanceCoefficientInFundingPayment = PerpMath.mulDiv(
                baseBalance,
                fundingGrowthGlobal.twLongPremiumX96.sub(twLongPremiumGrowthGlobalX96),
                uint256(PerpFixedPoint96._IQ96)
            );
        }
        if (baseBalance < 0) {
            balanceCoefficientInFundingPayment = PerpMath.mulDiv(
                baseBalance,
                fundingGrowthGlobal.twShortPremiumX96.sub(twShortPremiumGrowthGlobalX96),
                uint256(PerpFixedPoint96._IQ96)
            );
        }
        return balanceCoefficientInFundingPayment.div(_DEFAULT_FUNDING_PERIOD);
    }

    function getSqrtMarkTwapX96(
        address chAddress,
        address baseToken,
        uint32 twapInterval
    ) public view returns (uint160) {
        return
            UniswapV3Broker.getSqrtMarkTwapX96(
                IMarketRegistry(IClearingHouse(chAddress).getMarketRegistry()).getPool(baseToken),
                twapInterval
            );
    }

    function _getDeltaTwapX96AfterOptimal(
        address chAddress,
        address baseToken,
        int256 deltaTwapX96,
        uint256 indexTwapX96
    ) public view returns (int256) {
        IMarketRegistry.MarketInfo memory marketInfo = IMarketRegistry(IClearingHouse(chAddress).getMarketRegistry())
            .getMarketInfo(baseToken);
        if ((deltaTwapX96.abs().mul(1e6)) <= (indexTwapX96.mul(marketInfo.optimalDeltaTwapRatio))) {
            return deltaTwapX96 = PerpMath.mulDiv(deltaTwapX96, marketInfo.optimalFundingRatio, 1e6); // 25%;
        }
        return deltaTwapX96;
    }

    function _getDeltaTwapX96(
        address chAddress,
        uint256 markTwapX96,
        uint256 indexTwapX96
    ) public view returns (int256 deltaTwapX96) {
        uint24 maxFundingRate = IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig())
            .getMaxFundingRate();
        uint256 maxDeltaTwapX96 = indexTwapX96.mulRatio(maxFundingRate);
        uint256 absDeltaTwapX96;
        if (markTwapX96 > indexTwapX96) {
            absDeltaTwapX96 = markTwapX96.sub(indexTwapX96);
            deltaTwapX96 = absDeltaTwapX96 > maxDeltaTwapX96 ? maxDeltaTwapX96.toInt256() : absDeltaTwapX96.toInt256();
        } else {
            absDeltaTwapX96 = indexTwapX96.sub(markTwapX96);
            deltaTwapX96 = absDeltaTwapX96 > maxDeltaTwapX96 ? maxDeltaTwapX96.neg256() : absDeltaTwapX96.neg256();
        }
    }

    struct InternalFundingGrowthGlobalAndTwapsVars {
        uint256 longPositionSize;
        uint256 shortPositionSize;
        uint256 longMultiplier;
        uint256 shortMultiplier;
        int256 deltaTwapX96;
        int256 deltaTwPremiumX96;
        int256 deltaShortTwPremiumX96;
        int256 deltaLongTwPremiumX96;
    }

    function getFundingGrowthGlobalAndTwaps(
        address chAddress,
        address baseToken,
        uint256 firstTrade,
        uint256 lastSettled,
        uint256 timestamp,
        DataTypes.Growth memory lastFundingGrowthGlobal
    ) public view returns (DataTypes.Growth memory fundingGrowthGlobal, uint256 markTwap, uint256 indexTwap) {
        // shorten twapInterval if prior observations are not enough
        uint32 twapInterval;
        if (firstTrade != 0) {
            twapInterval = IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig()).getTwapInterval();
            // overflow inspection:
            // 2 ^ 32 = 4,294,967,296 > 100 years = 60 * 60 * 24 * 365 * 100 = 3,153,600,000
            uint32 deltaTimestamp = timestamp.sub(firstTrade).toUint32();
            twapInterval = twapInterval > deltaTimestamp ? deltaTimestamp : twapInterval;
        }
        // uint256 markTwapX96;
        // if (marketOpen) {
        //     markTwapX96 = getSqrtMarkTwapX96(baseToken, twapInterval).formatSqrtPriceX96ToPriceX96();
        //     indexTwap = IIndexPrice(baseToken).getIndexPrice(twapInterval);
        // } else {
        //     // if a market is paused/closed, we use the last known index price which is getPausedIndexPrice
        //     //
        //     // -----+--- twap interval ---+--- secondsAgo ---+
        //     //                        pausedTime            now

        //     // timestamp is pausedTime when the market is not open
        //     uint32 secondsAgo = _blockTimestamp().sub(timestamp).toUint32();
        //     markTwapX96 = UniswapV3Broker
        //         .getSqrtMarkTwapX96From(IMarketRegistry(_marketRegistry).getPool(baseToken), secondsAgo, twapInterval)
        //         .formatSqrtPriceX96ToPriceX96();
        //     indexTwap = IBaseToken(baseToken).getPausedIndexPrice();
        // }

        uint256 markTwapX96 = getSqrtMarkTwapX96(chAddress, baseToken, twapInterval).formatSqrtPriceX96ToPriceX96();

        markTwap = markTwapX96.formatX96ToX10_18();
        indexTwap = IIndexPrice(baseToken).getIndexPrice(twapInterval);

        if (timestamp == lastSettled || lastSettled == 0) {
            // if this is the latest updated timestamp, values in _globalFundingGrowthX96Map are up-to-date already
            fundingGrowthGlobal = lastFundingGrowthGlobal;
        } else {
            // deltaTwPremium = (markTwap - indexTwap) * (now - lastSettledTimestamp)
            // int256 deltaTwPremiumX96 = _getDeltaTwapX96(markTwapX96, indexTwap.formatX10_18ToX96()).mul(
            //     timestamp.sub(lastSettledTimestamp).toInt256()
            // );
            // fundingGrowthGlobal.twPremiumX96 = lastFundingGrowthGlobal.twPremiumX96.add(deltaTwPremiumX96);

            // // overflow inspection:
            // // assuming premium = 1 billion (1e9), time diff = 1 year (3600 * 24 * 365)
            // // log(1e9 * 2^96 * (3600 * 24 * 365) * 2^96) / log(2) = 246.8078491997 < 255
            // // twPremiumDivBySqrtPrice += deltaTwPremium / getSqrtMarkTwap(baseToken)
            // fundingGrowthGlobal.twPremiumDivBySqrtPriceX96 = lastFundingGrowthGlobal.twPremiumDivBySqrtPriceX96.add(
            //     PerpMath.mulDiv(deltaTwPremiumX96, PerpFixedPoint96._IQ96, getSqrtMarkTwapX96(baseToken, 0))
            // );

            InternalFundingGrowthGlobalAndTwapsVars memory vars;

            (vars.longPositionSize, vars.shortPositionSize) = IAccountBalance(
                IClearingHouse(chAddress).getAccountBalance()
            ).getMarketPositionSize(baseToken);
            if (vars.longPositionSize > 0 && vars.shortPositionSize > 0 && markTwap != indexTwap) {
                (vars.longMultiplier, vars.shortMultiplier) = IAccountBalance(
                    IClearingHouse(chAddress).getAccountBalance()
                ).getMarketMultiplier(baseToken);
                vars.deltaTwapX96 = _getDeltaTwapX96(chAddress, markTwapX96, indexTwap.formatX10_18ToX96());
                vars.deltaTwapX96 = _getDeltaTwapX96AfterOptimal(
                    chAddress,
                    baseToken,
                    vars.deltaTwapX96,
                    indexTwap.formatX10_18ToX96()
                );
                vars.deltaTwPremiumX96 = vars.deltaTwapX96.mul(timestamp.sub(lastSettled).toInt256());
                if (vars.deltaTwapX96 > 0) {
                    // LONG pay
                    fundingGrowthGlobal.twLongPremiumX96 = lastFundingGrowthGlobal.twLongPremiumX96.add(
                        vars.deltaTwPremiumX96.mulMultiplier(vars.longMultiplier)
                    );
                    // SHORT receive
                    vars.deltaShortTwPremiumX96 = vars.deltaTwPremiumX96.mul(vars.longPositionSize.toInt256()).div(
                        vars.shortPositionSize.toInt256()
                    );
                    fundingGrowthGlobal.twShortPremiumX96 = lastFundingGrowthGlobal.twShortPremiumX96.add(
                        vars.deltaShortTwPremiumX96.mulMultiplier(vars.shortMultiplier)
                    );
                } else if (vars.deltaTwapX96 < 0) {
                    // LONG receive
                    vars.deltaLongTwPremiumX96 = vars.deltaTwPremiumX96.mul(vars.shortPositionSize.toInt256()).div(
                        vars.longPositionSize.toInt256()
                    );
                    fundingGrowthGlobal.twLongPremiumX96 = lastFundingGrowthGlobal.twLongPremiumX96.add(
                        vars.deltaLongTwPremiumX96.mulMultiplier(vars.longMultiplier)
                    );
                    // SHORT pay
                    fundingGrowthGlobal.twShortPremiumX96 = lastFundingGrowthGlobal.twShortPremiumX96.add(
                        vars.deltaTwPremiumX96.mulMultiplier(vars.shortMultiplier)
                    );
                } else {
                    fundingGrowthGlobal = lastFundingGrowthGlobal;
                }
            } else {
                fundingGrowthGlobal = lastFundingGrowthGlobal;
            }
        }
        return (fundingGrowthGlobal, markTwap, indexTwap);
    }
}

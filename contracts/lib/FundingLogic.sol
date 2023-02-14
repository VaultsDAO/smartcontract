// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;
import { IAccountBalance } from "../interface/IAccountBalance.sol";
import { IInsuranceFund } from "../interface/IInsuranceFund.sol";
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
import { OpenOrder } from "../lib/OpenOrder.sol";
import { GenericLogic } from "../lib/GenericLogic.sol";
import { UniswapV3Broker } from "../lib/UniswapV3Broker.sol";
import { SwapMath } from "../lib/SwapMath.sol";
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

    function _blockTimestamp() internal view returns (uint256) {
        // Reply from Arbitrum
        // block.timestamp returns timestamp at the time at which the sequencer receives the tx.
        // It may not actually correspond to a particular L1 block
        return block.timestamp;
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
        bool marketOpen;
        uint32 twapInterval;
        uint256 timestamp;
        uint32 deltaTimestamp;
        uint256 markTwapX96;
        int256 deltaTwapX96;
        int256 deltaShortTwPremiumX96;
        int256 deltaLongTwPremiumX96;
        int256 deltaTwPremiumX96;
    }

    function getFundingGrowthGlobalAndTwaps(
        address chAddress,
        address baseToken,
        uint256 firstTrade,
        uint256 lastSettled,
        mapping(address => DataTypes.Growth) storage globalFundingGrowthX96Map
    ) public view returns (DataTypes.Growth memory fundingGrowthGlobal, uint256 markTwap, uint256 indexTwap) {
        InternalFundingGrowthGlobalAndTwapsVars memory vars;
        vars.marketOpen = IBaseToken(baseToken).isOpen();
        vars.timestamp = vars.marketOpen ? _blockTimestamp() : IBaseToken(baseToken).getPausedTimestamp();

        // shorten twapInterval if prior observations are not enough
        if (firstTrade != 0) {
            vars.twapInterval = IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig())
                .getTwapInterval();
            // overflow inspection:
            // 2 ^ 32 = 4,294,967,296 > 100 years = 60 * 60 * 24 * 365 * 100 = 3,153,600,000
            vars.deltaTimestamp = vars.timestamp.sub(firstTrade).toUint32();
            vars.twapInterval = vars.twapInterval > vars.deltaTimestamp ? vars.deltaTimestamp : vars.twapInterval;
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

        vars.markTwapX96 = getSqrtMarkTwapX96(chAddress, baseToken, vars.twapInterval).formatSqrtPriceX96ToPriceX96();

        markTwap = vars.markTwapX96.formatX96ToX10_18();
        indexTwap = IIndexPrice(baseToken).getIndexPrice(vars.twapInterval);

        DataTypes.Growth storage lastFundingGrowthGlobal = globalFundingGrowthX96Map[baseToken];
        if (vars.timestamp == lastSettled || lastSettled == 0) {
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

            (vars.longPositionSize, vars.shortPositionSize) = IAccountBalance(
                IClearingHouse(chAddress).getAccountBalance()
            ).getMarketPositionSize(baseToken);
            if (vars.longPositionSize > 0 && vars.shortPositionSize > 0 && markTwap != indexTwap) {
                (vars.longMultiplier, vars.shortMultiplier) = IAccountBalance(
                    IClearingHouse(chAddress).getAccountBalance()
                ).getMarketMultiplier(baseToken);
                vars.deltaTwapX96 = _getDeltaTwapX96AfterOptimal(
                    chAddress,
                    baseToken,
                    _getDeltaTwapX96(chAddress, vars.markTwapX96, indexTwap.formatX10_18ToX96()),
                    indexTwap.formatX10_18ToX96()
                );
                vars.deltaTwPremiumX96 = vars.deltaTwapX96.mul(vars.timestamp.sub(lastSettled).toInt256());
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

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
import "hardhat/console.sol";

library ExchangeLogic {
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

    //internal struct
    /// @param sqrtPriceLimitX96 tx will fill until it reaches this price but WON'T REVERT
    struct InternalOpenPositionParams {
        address trader;
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        bool isClose;
        uint256 amount;
        uint160 sqrtPriceLimitX96;
        bool isLiquidated;
        address liquidator;
    }

    //
    function _openPosition(
        address chAddress,
        InternalOpenPositionParams memory params
    ) internal returns (IExchange.SwapResponse memory) {
        // must settle funding first
        GenericLogic.settleFunding(chAddress, params.trader, params.baseToken);

        int256 accountValue;
        if (params.isLiquidated) {
            accountValue = GenericLogic.getAccountValue(chAddress, params.trader);
        }

        IExchange.SwapResponse memory response = IExchange(IClearingHouse(chAddress).getExchange()).swap(
            IExchange.SwapParams({
                trader: params.trader,
                baseToken: params.baseToken,
                isBaseToQuote: params.isBaseToQuote,
                isExactInput: params.isExactInput,
                isClose: params.isClose,
                amount: params.amount,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96
            })
        );

        address insuranceFund = IClearingHouse(chAddress).getInsuranceFund();
        uint256 fee = 0;
        if (!params.isLiquidated) {
            // insuranceFundFee
            _modifyOwedRealizedPnl(chAddress, insuranceFund, response.insuranceFundFee.toInt256());
            // platformFundFee
            _modifyOwedRealizedPnl(
                chAddress,
                IClearingHouse(chAddress).getPlatformFund(),
                response.platformFundFee.toInt256()
            );
            // sum fee, sub direct balance
            fee = response.insuranceFundFee.add(response.platformFundFee);
            _modifyOwedRealizedPnl(chAddress, params.trader, fee.toInt256().neg256());
        } else {
            // EL_LIA: liquidator invalid address
            require(params.liquidator != address(0), "EL_LIA");

            response.platformFundFee = 0;
            // // trader pays liquidation penalty
            // uint256 liquidationPenalty = liquidatedPositionNotional.abs().mulRatio(_getLiquidationPenaltyRatio());
            response.insuranceFundFee = response.quote.mulRatio(GenericLogic.getLiquidationPenaltyRatio(chAddress));

            fee = response.insuranceFundFee.add(response.platformFundFee);
            _modifyOwedRealizedPnl(chAddress, params.trader, fee.neg256());

            // // if there is bad debt, liquidation fees all go to liquidator; otherwise, split between liquidator & IF
            uint256 liquidationFeeToLiquidator = fee.div(2);
            uint256 liquidationFeeToIF;
            if (accountValue < 0) {
                liquidationFeeToLiquidator = fee;
            } else {
                liquidationFeeToIF = fee.sub(liquidationFeeToLiquidator);
                _modifyOwedRealizedPnl(chAddress, insuranceFund, liquidationFeeToIF.toInt256());
            }
            _modifyOwedRealizedPnl(chAddress, params.liquidator, liquidationFeeToLiquidator.toInt256());

            // // assume there is no longer any unsettled bad debt in the system
            // // (so that true IF capacity = accountValue(IF) + USDC.balanceOf(IF))
            // // if trader's account value becomes negative, the amount is the bad debt IF must have enough capacity to cover
            {
                int256 accountValueAfterLiquidationX10_18 = GenericLogic.getAccountValue(chAddress, params.trader);

                if (accountValueAfterLiquidationX10_18 < 0) {
                    int256 insuranceFundCapacityX10_18 = IInsuranceFund(insuranceFund)
                        .getInsuranceFundCapacity()
                        .parseSettlementToken(IVault(IClearingHouse(chAddress).getVault()).decimals());

                    // CH_IIC: insufficient insuranceFund capacity
                    require(insuranceFundCapacityX10_18 >= accountValueAfterLiquidationX10_18.neg256(), "CH_IIC");
                }
            }
        }
        // examples:
        // https://www.figma.com/file/xuue5qGH4RalX7uAbbzgP3/swap-accounting-and-events?node-id=0%3A1
        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).settleBalanceAndDeregister(
            params.trader,
            params.baseToken,
            response.exchangedPositionSize,
            response.exchangedPositionNotional,
            response.pnlToBeRealized,
            0
        );

        if (!params.isLiquidated && response.pnlToBeRealized != 0) {
            // if realized pnl is not zero, that means trader is reducing or closing position
            // trader cannot reduce/close position if the remaining account value is less than
            // accountValue * LiquidationPenaltyRatio, which
            // enforces traders to keep LiquidationPenaltyRatio of accountValue to
            // shore the remaining positions and make sure traders having enough money to pay liquidation penalty.

            // CH_NEMRM : not enough minimum required margin after reducing/closing position
            require(
                GenericLogic.getAccountValue(chAddress, params.trader) >=
                    IAccountBalance(IClearingHouse(chAddress).getAccountBalance())
                        .getTotalAbsPositionValue(params.trader)
                        .mulRatio(
                            IClearingHouseConfig(IClearingHouse(chAddress).getClearingHouseConfig())
                                .getLiquidationPenaltyRatio()
                        )
                        .toInt256(),
                "CH_NEMRM"
            );
        }

        // if not closing a position, check margin ratio after swap
        if (params.isClose) {
            GenericLogic.requireEnoughFreeCollateralForClose(chAddress, params.trader);
        } else {
            if (!params.isLiquidated) {
                GenericLogic.requireEnoughFreeCollateral(chAddress, params.trader);
            }
        }

        if (!params.isLiquidated) {
            // openNotional will be zero if baseToken is deregistered from trader's token list.
            int256 openNotional = GenericLogic.getTakerOpenNotional(chAddress, params.trader, params.baseToken);
            emit GenericLogic.PositionChanged(
                params.trader,
                params.baseToken,
                response.exchangedPositionSize,
                response.exchangedPositionNotional,
                fee,
                openNotional,
                response.pnlToBeRealized, // realizedPnl
                response.sqrtPriceAfterX96
            );
        } else {
            emit GenericLogic.PositionLiquidated(
                params.trader,
                params.baseToken,
                response.exchangedPositionSize,
                response.exchangedPositionNotional,
                fee,
                response.pnlToBeRealized, // realizedPnl
                response.sqrtPriceAfterX96,
                params.liquidator
            );
        }

        return response;
    }

    function openPositionFor(
        address chAddress,
        address trader,
        DataTypes.OpenPositionParams memory params
    ) public returns (uint256 base, uint256 quote, uint256 fee) {
        // input requirement checks:
        //   baseToken: in Exchange.settleFunding()
        //   isBaseToQuote & isExactInput: X
        //   amount: in UniswapV3Pool.swap()
        //   oppositeAmountBound: in _checkSlippage()
        //   deadline: here
        //   sqrtPriceLimitX96: X (this is not for slippage protection)
        //   referralCode: X

        GenericLogic.checkMarketOpen(params.baseToken);

        GenericLogic.requireNotMaker(chAddress, trader);

        // register token if it's the first time
        GenericLogic.registerBaseToken(chAddress, trader, params.baseToken);

        IExchange.SwapResponse memory response = _openPosition(
            chAddress,
            InternalOpenPositionParams({
                trader: trader,
                baseToken: params.baseToken,
                isBaseToQuote: params.isBaseToQuote,
                isExactInput: params.isExactInput,
                amount: params.amount,
                isClose: false,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                isLiquidated: false,
                liquidator: address(0)
            })
        );

        GenericLogic.checkSlippage(
            GenericLogic.InternalCheckSlippageParams({
                isBaseToQuote: params.isBaseToQuote,
                isExactInput: params.isExactInput,
                base: response.base,
                quote: response.quote,
                oppositeAmountBound: params.oppositeAmountBound
            })
        );

        _mintMinerReward(chAddress, trader, response.quote);

        _referredPositionChanged(params.referralCode);

        return (response.base, response.quote, response.insuranceFundFee.add(response.platformFundFee));
    }

    function _referredPositionChanged(bytes32 referralCode) internal {
        if (referralCode != 0) {
            emit GenericLogic.ReferredPositionChanged(referralCode);
        }
    }

    function closePosition(
        address chAddress,
        address trader,
        DataTypes.ClosePositionParams calldata params
    ) public returns (uint256 base, uint256 quote, uint256 fee) {
        // input requirement checks:
        //   baseToken: in Exchange.settleFunding()
        //   sqrtPriceLimitX96: X (this is not for slippage protection)
        //   oppositeAmountBound: in _checkSlippage()
        //   deadline: here
        //   referralCode: X

        GenericLogic.checkMarketOpen(params.baseToken);

        GenericLogic.requireNotMaker(chAddress, trader);

        int256 positionSize = GenericLogic.getTakerPositionSafe(chAddress, trader, params.baseToken);

        // old position is long. when closing, it's baseToQuote && exactInput (sell exact base)
        // old position is short. when closing, it's quoteToBase && exactOutput (buy exact base back)
        bool isBaseToQuote = positionSize > 0;

        IExchange.SwapResponse memory response = _openPosition(
            chAddress,
            InternalOpenPositionParams({
                trader: trader,
                baseToken: params.baseToken,
                isBaseToQuote: isBaseToQuote,
                isExactInput: isBaseToQuote,
                isClose: true,
                amount: positionSize.abs(),
                sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                isLiquidated: false,
                liquidator: address(0)
            })
        );

        GenericLogic.checkSlippage(
            GenericLogic.InternalCheckSlippageParams({
                isBaseToQuote: isBaseToQuote,
                isExactInput: isBaseToQuote,
                base: response.base,
                quote: response.quote,
                oppositeAmountBound: GenericLogic.getOppositeAmount(
                    chAddress,
                    params.oppositeAmountBound,
                    response.isPartialClose
                )
            })
        );

        _mintMinerReward(chAddress, trader, response.quote);

        _referredPositionChanged(params.referralCode);

        return (response.base, response.quote, response.insuranceFundFee.add(response.platformFundFee));
    }

    function _mintMinerReward(address chAddress, address trader, uint256 quote) internal {
        address rewardMiner = IClearingHouse(chAddress).getRewardMiner();
        if (rewardMiner != address(0)) {
            IRewardMiner(rewardMiner).mint(trader, quote);
        }
    }

    function liquidate(
        address chAddress,
        address liquidator,
        address trader,
        address baseToken,
        bool isForced
    ) public returns (uint256 base, uint256 quote, uint256 fee) {
        //
        GenericLogic.checkMarketOpen(baseToken);

        GenericLogic.requireNotMaker(chAddress, trader);

        if (!isForced) {
            // CH_EAV: enough account value
            require(GenericLogic.isLiquidatable(chAddress, trader), "CH_EAV");
        }

        int256 positionSize = GenericLogic.getTakerPositionSafe(chAddress, trader, baseToken);

        // old position is long. when closing, it's baseToQuote && exactInput (sell exact base)
        // old position is short. when closing, it's quoteToBase && exactOutput (buy exact base back)
        bool isBaseToQuote = positionSize > 0;
        //
        IExchange.SwapResponse memory response = _openPosition(
            chAddress,
            InternalOpenPositionParams({
                trader: trader,
                baseToken: baseToken,
                isBaseToQuote: isBaseToQuote,
                isExactInput: isBaseToQuote,
                isClose: true,
                amount: positionSize.abs(),
                sqrtPriceLimitX96: 0,
                isLiquidated: true,
                liquidator: liquidator
            })
        );

        IVault(IClearingHouse(chAddress).getVault()).settleBadDebt(trader);

        return (response.base, response.quote, response.insuranceFundFee.add(response.platformFundFee));
    }

    function _getLiquidatedPositionSizeAndNotional(
        address chAddress,
        address trader,
        address baseToken,
        int256 accountValue,
        int256 positionSizeToBeLiquidated
    ) internal view returns (int256, int256) {
        int256 maxLiquidatablePositionSize = IAccountBalance(IClearingHouse(chAddress).getAccountBalance())
            .getLiquidatablePositionSize(trader, baseToken, accountValue);

        if (positionSizeToBeLiquidated.abs() > maxLiquidatablePositionSize.abs() || positionSizeToBeLiquidated == 0) {
            positionSizeToBeLiquidated = maxLiquidatablePositionSize;
        }

        int256 liquidatedPositionSize = positionSizeToBeLiquidated.neg256();
        int256 liquidatedPositionNotional = positionSizeToBeLiquidated.mulDiv(
            GenericLogic.getIndexPrice(chAddress, baseToken).toInt256(),
            1e18
        );

        return (liquidatedPositionSize, liquidatedPositionNotional);
    }

    function _modifyOwedRealizedPnl(address chAddress, address trader, int256 amount) internal {
        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).modifyOwedRealizedPnl(trader, amount);
    }

    // /// @dev Calculate how much profit/loss we should realize,
    // ///      The profit/loss is calculated by exchangedPositionSize/exchangedPositionNotional amount
    // ///      and existing taker's base/quote amount.
    // function _modifyPositionAndRealizePnl(
    //     address chAddress,
    //     address trader,
    //     address baseToken,
    //     int256 exchangedPositionSize,
    //     int256 exchangedPositionNotional,
    //     uint256 makerFee,
    //     uint256 takerFee
    // ) internal {
    //     int256 realizedPnl;
    //     if (exchangedPositionSize != 0) {
    //         realizedPnl = IExchange(IClearingHouse(chAddress).getExchange()).getPnlToBeRealized(
    //             IExchange.RealizePnlParams({
    //                 trader: trader,
    //                 baseToken: baseToken,
    //                 base: exchangedPositionSize,
    //                 quote: exchangedPositionNotional
    //             })
    //         );
    //     }

    //     // realizedPnl is realized here
    //     // will deregister baseToken if there is no position
    //     IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).settleBalanceAndDeregister(
    //         trader,
    //         baseToken,
    //         exchangedPositionSize, // takerBase
    //         exchangedPositionNotional, // takerQuote
    //         realizedPnl,
    //         makerFee.toInt256()
    //     );
    //     int256 openNotional = GenericLogic.getTakerOpenNotional(chAddress, trader, baseToken);
    //     uint160 currentPrice = GenericLogic.getSqrtMarkX96(chAddress, baseToken);
    //     emit GenericLogic.PositionChanged(
    //         trader,
    //         baseToken,
    //         exchangedPositionSize,
    //         exchangedPositionNotional,
    //         takerFee, // fee
    //         openNotional, // openNotional
    //         realizedPnl,
    //         currentPrice // sqrtPriceAfterX96: no swap, so market price didn't change
    //     );
    // }
}

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

    uint256 internal constant _DUST_AMOUNT = 1e10; // 15 sec

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
    }

    struct InternalSwapResponse {
        int256 base;
        int256 quote;
        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        uint256 fee;
        int24 tick;
    }

    //
    function _openPosition(
        address chAddress,
        InternalOpenPositionParams memory params
    ) internal returns (IExchange.SwapResponse memory) {
        // must settle funding first
        GenericLogic.settleFunding(chAddress, params.trader, params.baseToken);

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

        // EL_DA: DUST Amount
        require(
            response.exchangedPositionSize.abs() >= _DUST_AMOUNT ||
                response.exchangedPositionNotional.abs() >= _DUST_AMOUNT,
            "EL_DA"
        );

        address insuranceFund = IClearingHouse(chAddress).getInsuranceFund();
        // insuranceFundFee
        _modifyOwedRealizedPnl(chAddress, insuranceFund, response.insuranceFundFee.toInt256());
        // platformFundFee
        _modifyOwedRealizedPnl(
            chAddress,
            IClearingHouse(chAddress).getPlatformFund(),
            response.platformFundFee.toInt256()
        );
        // sum fee, sub direct balance
        uint256 fee = response.insuranceFundFee.add(response.platformFundFee);
        _modifyOwedRealizedPnl(chAddress, params.trader, fee.toInt256().neg256());

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

        if (response.pnlToBeRealized != 0) {
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
            GenericLogic.requireEnoughFreeCollateral(chAddress, params.trader);
        }

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
                sqrtPriceLimitX96: params.sqrtPriceLimitX96
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
                sqrtPriceLimitX96: params.sqrtPriceLimitX96
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

    // function liquidate(
    //     address chAddress,
    //     address liquidator,
    //     address trader,
    //     address baseToken,
    //     bool isForced
    // ) public returns (uint256 base, uint256 quote, uint256 fee) {
    //     //
    //     GenericLogic.checkMarketOpen(baseToken);

    //     GenericLogic.requireNotMaker(chAddress, trader);

    //     if (!isForced) {
    //         // CH_EAV: enough account value
    //         require(GenericLogic.isLiquidatable(chAddress, trader), "CH_EAV");
    //     }

    //     int256 positionSize = GenericLogic.getTakerPositionSafe(chAddress, trader, baseToken);

    //     // old position is long. when closing, it's baseToQuote && exactInput (sell exact base)
    //     // old position is short. when closing, it's quoteToBase && exactOutput (buy exact base back)
    //     bool isBaseToQuote = positionSize > 0;
    //     //
    //     IExchange.SwapResponse memory response = _openPosition(
    //         chAddress,
    //         InternalOpenPositionParams({
    //             trader: trader,
    //             baseToken: baseToken,
    //             isBaseToQuote: isBaseToQuote,
    //             isExactInput: isBaseToQuote,
    //             isClose: true,
    //             amount: positionSize.abs(),
    //             sqrtPriceLimitX96: 0
    //         })
    //     );

    //     IVault(IClearingHouse(chAddress).getVault()).settleBadDebt(trader);

    //     return (response.base, response.quote, response.insuranceFundFee.add(response.platformFundFee));
    // }

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

        int256 markPrice = GenericLogic
            .getSqrtMarkX96(chAddress, baseToken)
            .formatSqrtPriceX96ToPriceX96()
            .formatX96ToX10_18()
            .toInt256();

        int256 liquidatedPositionSize = positionSizeToBeLiquidated.neg256();
        int256 liquidatedPositionNotional = positionSizeToBeLiquidated.mulDiv(markPrice, 1e18);

        return (liquidatedPositionSize, liquidatedPositionNotional);
    }

    function _modifyOwedRealizedPnl(address chAddress, address trader, int256 amount) internal {
        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).modifyOwedRealizedPnl(trader, amount);
    }

    /// @dev Calculate how much profit/loss we should realize,
    ///      The profit/loss is calculated by exchangedPositionSize/exchangedPositionNotional amount
    ///      and existing taker's base/quote amount.
    function _modifyPositionAndRealizePnl(
        address chAddress,
        address trader,
        address baseToken,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        uint256 makerFee,
        uint256 takerFee
    ) internal {
        int256 realizedPnl;
        if (exchangedPositionSize != 0) {
            realizedPnl = IExchange(IClearingHouse(chAddress).getExchange()).getPnlToBeRealized(
                IExchange.RealizePnlParams({
                    trader: trader,
                    baseToken: baseToken,
                    base: exchangedPositionSize,
                    quote: exchangedPositionNotional
                })
            );
        }

        // realizedPnl is realized here
        // will deregister baseToken if there is no position
        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).settleBalanceAndDeregister(
            trader,
            baseToken,
            exchangedPositionSize, // takerBase
            exchangedPositionNotional, // takerQuote
            realizedPnl,
            makerFee.toInt256()
        );
        int256 openNotional = GenericLogic.getTakerOpenNotional(chAddress, trader, baseToken);
        uint160 currentPrice = GenericLogic.getSqrtMarkX96(chAddress, baseToken);
        emit GenericLogic.PositionChanged(
            trader,
            baseToken,
            exchangedPositionSize,
            exchangedPositionNotional,
            takerFee, // fee
            openNotional, // openNotional
            realizedPnl,
            currentPrice // sqrtPriceAfterX96: no swap, so market price didn't change
        );
    }

    struct InternalLiquidateParams {
        address chAddress;
        address marketRegistry;
        address liquidator;
        address trader;
        address baseToken;
        int256 positionSizeToBeLiquidated;
        bool isForced;
    }

    struct InternalLiquidateVars {
        int256 positionSize;
        int256 openNotional;
        uint256 liquidationPenalty;
        int256 accountValue;
        int256 liquidatedPositionSize;
        int256 liquidatedPositionNotional;
        uint256 liquidationFeeToLiquidator;
        uint256 liquidationFeeToIF;
        int256 liquidatorExchangedPositionNotional;
        int256 accountValueAfterLiquidationX10_18;
        int256 insuranceFundCapacityX10_18;
        int256 liquidatorExchangedPositionSize;
        int256 pnlToBeRealized;
        address insuranceFund;
        uint256 sqrtPriceX96;
    }

    function liquidate(
        InternalLiquidateParams memory params
    ) public returns (uint256 base, uint256 quote, uint256 fee) {
        InternalLiquidateVars memory vars;

        GenericLogic.checkMarketOpen(params.baseToken);

        GenericLogic.requireNotMaker(params.chAddress, params.trader);

        if (!params.isForced) {
            // CH_EAV: enough account value
            require(GenericLogic.isLiquidatable(params.chAddress, params.trader), "CH_EAV");
        }

        vars.positionSize = GenericLogic.getTakerPositionSafe(params.chAddress, params.trader, params.baseToken);
        vars.openNotional = IAccountBalance(IClearingHouse(params.chAddress).getAccountBalance()).getTakerOpenNotional(
            params.trader,
            params.baseToken
        );

        // CH_WLD: wrong liquidation direction
        require(vars.positionSize.mul(params.positionSizeToBeLiquidated) >= 0, "CH_WLD");

        GenericLogic.registerBaseToken(params.chAddress, params.liquidator, params.baseToken);

        // must settle funding first
        GenericLogic.settleFunding(params.chAddress, params.trader, params.baseToken);
        GenericLogic.settleFunding(params.chAddress, params.liquidator, params.baseToken);

        vars.accountValue = GenericLogic.getAccountValue(params.chAddress, params.trader);

        // trader's position is closed at index price and pnl realized
        (vars.liquidatedPositionSize, vars.liquidatedPositionNotional) = _getLiquidatedPositionSizeAndNotional(
            params.chAddress,
            params.trader,
            params.baseToken,
            vars.accountValue,
            params.positionSizeToBeLiquidated
        );

        vars.pnlToBeRealized = GenericLogic.getPnlToBeRealized(
            GenericLogic.InternalRealizePnlParams({
                trader: params.trader,
                baseToken: params.baseToken,
                takerPositionSize: vars.positionSize,
                takerOpenNotional: vars.openNotional,
                base: vars.liquidatedPositionSize,
                quote: vars.liquidatedPositionNotional
            })
        );

        _modifyPositionAndRealizePnl(
            params.chAddress,
            params.trader,
            params.baseToken,
            vars.liquidatedPositionSize,
            vars.liquidatedPositionNotional,
            0,
            0
        );

        // trader pays liquidation penalty
        vars.liquidationPenalty = vars.liquidatedPositionNotional.abs().mulRatio(
            GenericLogic.getLiquidationPenaltyRatio(params.chAddress)
        );
        IAccountBalance(IClearingHouse(params.chAddress).getAccountBalance()).modifyOwedRealizedPnl(
            params.trader,
            vars.liquidationPenalty.neg256()
        );

        vars.insuranceFund = IClearingHouse(params.chAddress).getInsuranceFund();

        // if there is bad debt, liquidation fees all go to liquidator; otherwise, split between liquidator & IF
        vars.liquidationFeeToLiquidator = vars.liquidationPenalty.div(2);
        vars.liquidationFeeToIF;
        if (vars.accountValue < 0) {
            vars.liquidationFeeToLiquidator = vars.liquidationPenalty;
        } else {
            vars.liquidationFeeToIF = vars.liquidationPenalty.sub(vars.liquidationFeeToLiquidator);
            IAccountBalance(IClearingHouse(params.chAddress).getAccountBalance()).modifyOwedRealizedPnl(
                vars.insuranceFund,
                vars.liquidationFeeToIF.toInt256()
            );
        }

        // assume there is no longer any unsettled bad debt in the system
        // (so that true IF capacity = accountValue(IF) + USDC.balanceOf(IF))
        // if trader's account value becomes negative, the amount is the bad debt IF must have enough capacity to cover
        {
            vars.accountValueAfterLiquidationX10_18 = GenericLogic.getAccountValue(params.chAddress, params.trader);

            if (vars.accountValueAfterLiquidationX10_18 < 0) {
                vars.insuranceFundCapacityX10_18 = IInsuranceFund(vars.insuranceFund)
                    .getInsuranceFundCapacity()
                    .parseSettlementToken(IVault(IClearingHouse(params.chAddress).getVault()).decimals());

                // CH_IIC: insufficient insuranceFund capacity
                require(vars.insuranceFundCapacityX10_18 >= vars.accountValueAfterLiquidationX10_18.neg256(), "CH_IIC");
            }
        }

        // liquidator opens a position with liquidationFeeToLiquidator as a discount
        // liquidator's openNotional = -liquidatedPositionNotional + liquidationFeeToLiquidator
        vars.liquidatorExchangedPositionSize = vars.liquidatedPositionSize.neg256();
        vars.liquidatorExchangedPositionNotional = vars.liquidatedPositionNotional.neg256();
        // note that this function will realize pnl if it's reducing liquidator's existing position size
        _modifyPositionAndRealizePnl(
            params.chAddress,
            params.liquidator,
            params.baseToken,
            vars.liquidatorExchangedPositionSize, // exchangedPositionSize
            vars.liquidatorExchangedPositionNotional, // exchangedPositionNotional
            0, // makerFee
            0 // takerFee
        );
        // add fee to pnl
        IAccountBalance(IClearingHouse(params.chAddress).getAccountBalance()).modifyOwedRealizedPnl(
            params.liquidator,
            vars.liquidationFeeToLiquidator.toInt256()
        );

        GenericLogic.requireEnoughFreeCollateral(params.chAddress, params.liquidator);

        (vars.sqrtPriceX96, , , , , , ) = UniswapV3Broker.getSlot0(
            IMarketRegistry(params.marketRegistry).getPool(params.baseToken)
        );

        IVault(IClearingHouse(params.chAddress).getVault()).settleBadDebt(params.trader);

        emit GenericLogic.PositionLiquidated(
            params.trader,
            params.baseToken,
            vars.liquidatedPositionSize,
            vars.liquidatedPositionNotional,
            vars.liquidationPenalty,
            vars.pnlToBeRealized, // realizedPnl
            vars.sqrtPriceX96,
            params.liquidator,
            vars.liquidationFeeToLiquidator
        );

        return (vars.liquidatedPositionSize.abs(), vars.liquidatedPositionNotional.abs(), vars.liquidationPenalty);
    }

    //
    function swap(address chAddress, IExchange.SwapParams memory params) public returns (InternalSwapResponse memory) {
        IMarketRegistry.MarketInfo memory marketInfo = IMarketRegistry(IClearingHouse(chAddress).getMarketRegistry())
            .getMarketInfo(params.baseToken);

        (uint256 scaledAmountForUniswapV3PoolSwap, int256 signedScaledAmountForReplaySwap) = SwapMath
            .calcScaledAmountForSwaps(
                params.isBaseToQuote,
                params.isExactInput,
                params.amount,
                marketInfo.uniswapFeeRatio
            );

        // simulate the swap to calculate the fees charged in exchange
        IOrderBook.ReplaySwapResponse memory replayResponse = IOrderBook(IClearingHouse(chAddress).getOrderBook())
            .replaySwap(
                IOrderBook.ReplaySwapParams({
                    baseToken: params.baseToken,
                    isBaseToQuote: params.isBaseToQuote,
                    shouldUpdateState: true,
                    amount: signedScaledAmountForReplaySwap,
                    sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                    uniswapFeeRatio: marketInfo.uniswapFeeRatio
                })
            );
        UniswapV3Broker.SwapResponse memory response = UniswapV3Broker.swap(
            UniswapV3Broker.SwapParams(
                marketInfo.pool,
                chAddress,
                params.isBaseToQuote,
                params.isExactInput,
                // mint extra base token before swap
                scaledAmountForUniswapV3PoolSwap,
                params.sqrtPriceLimitX96,
                abi.encode(
                    IExchange.SwapCallbackData({
                        trader: params.trader,
                        baseToken: params.baseToken,
                        pool: marketInfo.pool,
                        fee: replayResponse.fee,
                        uniswapFeeRatio: marketInfo.uniswapFeeRatio
                    })
                )
            )
        );

        // as we charge fees in ClearingHouse instead of in Uniswap pools,
        // we need to scale up base or quote amounts to get the exact exchanged position size and notional
        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        if (params.isBaseToQuote) {
            // short: exchangedPositionSize <= 0 && exchangedPositionNotional >= 0
            exchangedPositionSize = SwapMath
                .calcAmountScaledByFeeRatio(response.base, marketInfo.uniswapFeeRatio, false)
                .neg256();
            // due to base to quote fee, exchangedPositionNotional contains the fee
            // s.t. we can take the fee away from exchangedPositionNotional
            exchangedPositionNotional = response.quote.toInt256();
        } else {
            // long: exchangedPositionSize >= 0 && exchangedPositionNotional <= 0
            exchangedPositionSize = response.base.toInt256();

            // scaledAmountForUniswapV3PoolSwap is the amount of quote token to swap (input),
            // response.quote is the actual amount of quote token swapped (output).
            // as long as liquidity is enough, they would be equal.
            // otherwise, response.quote < scaledAmountForUniswapV3PoolSwap
            // which also means response.quote < exact input amount.
            if (params.isExactInput && response.quote == scaledAmountForUniswapV3PoolSwap) {
                // NOTE: replayResponse.fee might have an extra charge of 1 wei, for instance:
                // Q2B exact input amount 1000000000000000000000 with fee ratio 1%,
                // replayResponse.fee is actually 10000000000000000001 (1000 * 1% + 1 wei),
                // and quote = exchangedPositionNotional - replayResponse.fee = -1000000000000000000001
                // which is not matched with exact input 1000000000000000000000
                // we modify exchangedPositionNotional here to make sure
                // quote = exchangedPositionNotional - replayResponse.fee = exact input
                exchangedPositionNotional = params.amount.sub(replayResponse.fee).toInt256().neg256();
            } else {
                exchangedPositionNotional = SwapMath
                    .calcAmountScaledByFeeRatio(response.quote, marketInfo.uniswapFeeRatio, false)
                    .neg256();
            }
        }

        // // update the timestamp of the first tx in this market
        // if (_firstTradedTimestampMap[params.baseToken] == 0) {
        //     _firstTradedTimestampMap[params.baseToken] = _blockTimestamp();
        // }

        return
            InternalSwapResponse({
                base: exchangedPositionSize,
                quote: exchangedPositionNotional.sub(replayResponse.fee.toInt256()),
                exchangedPositionSize: exchangedPositionSize,
                exchangedPositionNotional: exchangedPositionNotional,
                fee: replayResponse.fee,
                tick: replayResponse.tick
            });
    }

    function estimateSwap(
        address chAddress,
        DataTypes.OpenPositionParams memory params
    ) public view returns (IOrderBook.ReplaySwapResponse memory response) {
        IMarketRegistry.MarketInfo memory marketInfo = IMarketRegistry(IClearingHouse(chAddress).getMarketRegistry())
            .getMarketInfo(params.baseToken);
        uint24 uniswapFeeRatio = marketInfo.uniswapFeeRatio;
        (, int256 signedScaledAmountForReplaySwap) = SwapMath.calcScaledAmountForSwaps(
            params.isBaseToQuote,
            params.isExactInput,
            params.amount,
            uniswapFeeRatio
        );
        response = IOrderBook(IClearingHouse(chAddress).getOrderBook()).estimateSwap(
            IOrderBook.ReplaySwapParams({
                baseToken: params.baseToken,
                isBaseToQuote: params.isBaseToQuote,
                amount: signedScaledAmountForReplaySwap,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                uniswapFeeRatio: uniswapFeeRatio,
                shouldUpdateState: false
            })
        );
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

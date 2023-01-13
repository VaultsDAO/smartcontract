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

library LiquidityLogic {
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

    function addLiquidity(
        address chAddress,
        address trader,
        DataTypes.AddLiquidityParams calldata params
    )
        public
        returns (
            // check onlyLiquidityAdmin
            DataTypes.AddLiquidityResponse memory
        )
    {
        // input requirement checks:
        //   baseToken: in Exchange.settleFunding()
        //   base & quote: in LiquidityAmounts.getLiquidityForAmounts() -> FullMath.mulDiv()
        //   lowerTick & upperTick: in UniswapV3Pool._modifyPosition()
        //   minBase, minQuote & deadline: here

        GenericLogic.checkMarketOpen(params.baseToken);

        // This condition is to prevent the intentional bad debt attack through price manipulation.
        // CH_OMPS: Over the maximum price spread
        require(!IExchange(IClearingHouse(chAddress).getExchange()).isOverPriceSpread(params.baseToken), "CH_OMPS");

        // CH_DUTB: Disable useTakerBalance
        require(!params.useTakerBalance, "CH_DUTB");

        // register token if it's the first time
        GenericLogic.registerBaseToken(chAddress, trader, params.baseToken);

        // must settle funding first
        DataTypes.Growth memory fundingGrowthGlobal = GenericLogic.settleFunding(chAddress, trader, params.baseToken);

        // note that we no longer check available tokens here because CH will always auto-mint in UniswapV3MintCallback
        IOrderBook.AddLiquidityResponse memory response = IOrderBook(IClearingHouse(chAddress).getOrderBook())
            .addLiquidity(
                IOrderBook.AddLiquidityParams({
                    trader: trader,
                    baseToken: params.baseToken,
                    base: params.base,
                    quote: params.quote,
                    lowerTick: params.lowerTick,
                    upperTick: params.upperTick,
                    fundingGrowthGlobal: fundingGrowthGlobal
                })
            );

        GenericLogic.checkSlippageAfterLiquidityChange(response.base, params.minBase, response.quote, params.minQuote);

        // if !useTakerBalance, takerBalance won't change, only need to collects fee to oweRealizedPnl
        if (params.useTakerBalance) {
            bool isBaseAdded = response.base != 0;

            // can't add liquidity within range from take position
            require(isBaseAdded != (response.quote != 0), "CH_CALWRFTP");

            DataTypes.AccountMarketInfo memory accountMarketInfo = IAccountBalance(
                IClearingHouse(chAddress).getAccountBalance()
            ).getAccountInfo(trader, params.baseToken);

            // the signs of removedPositionSize and removedOpenNotional are always the opposite.
            int256 removedPositionSize;
            int256 removedOpenNotional;
            if (isBaseAdded) {
                // taker base not enough
                require(accountMarketInfo.takerPositionSize >= response.base.toInt256(), "CH_TBNE");

                removedPositionSize = response.base.neg256();

                // move quote debt from taker to maker:
                // takerOpenNotional(-) * removedPositionSize(-) / takerPositionSize(+)

                // overflow inspection:
                // Assume collateral is 2.406159692E28 and index price is 1e-18
                // takerOpenNotional ~= 10 * 2.406159692E28 = 2.406159692E29 --> x
                // takerPositionSize ~= takerOpenNotional/index price = x * 1e18 = 2.4061597E38
                // max of removedPositionSize = takerPositionSize = 2.4061597E38
                // (takerOpenNotional * removedPositionSize) < 2^255
                // 2.406159692E29 ^2 * 1e18 < 2^255
                removedOpenNotional = accountMarketInfo.takerOpenNotional.mul(removedPositionSize).div(
                    accountMarketInfo.takerPositionSize
                );
            } else {
                // taker quote not enough
                require(accountMarketInfo.takerOpenNotional >= response.quote.toInt256(), "CH_TQNE");

                removedOpenNotional = response.quote.neg256();

                // move base debt from taker to maker:
                // takerPositionSize(-) * removedOpenNotional(-) / takerOpenNotional(+)
                // overflow inspection: same as above
                removedPositionSize = accountMarketInfo.takerPositionSize.mul(removedOpenNotional).div(
                    accountMarketInfo.takerOpenNotional
                );
            }

            // update orderDebt to record the cost of this order
            IOrderBook(IClearingHouse(chAddress).getOrderBook()).updateOrderDebt(
                OpenOrder.calcOrderKey(trader, params.baseToken, params.lowerTick, params.upperTick),
                removedPositionSize,
                removedOpenNotional
            );

            // update takerBalances as we're using takerBalances to provide liquidity
            (, int256 takerOpenNotional) = IAccountBalance(IClearingHouse(chAddress).getAccountBalance())
                .modifyTakerBalance(trader, params.baseToken, removedPositionSize, removedOpenNotional);

            uint256 sqrtPrice = GenericLogic.getSqrtMarkX96(chAddress, params.baseToken);
            emit GenericLogic.PositionChanged(
                trader,
                params.baseToken,
                removedPositionSize, // exchangedPositionSize
                removedOpenNotional, // exchangedPositionNotional
                0, // fee
                takerOpenNotional, // openNotional
                0, // realizedPnl
                sqrtPrice // sqrtPriceAfterX96
            );
        }

        // fees always have to be collected to owedRealizedPnl, as long as there is a change in liquidity
        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).modifyOwedRealizedPnl(
            trader,
            response.fee.toInt256()
        );

        // after token balances are updated, we can check if there is enough free collateral
        GenericLogic.requireEnoughFreeCollateral(chAddress, trader);

        emit GenericLogic.LiquidityChanged(
            trader,
            params.baseToken,
            IClearingHouse(chAddress).getQuoteToken(),
            params.lowerTick,
            params.upperTick,
            response.base.toInt256(),
            response.quote.toInt256(),
            response.liquidity.toInt128(),
            response.fee
        );

        return
            DataTypes.AddLiquidityResponse({
                base: response.base,
                quote: response.quote,
                fee: response.fee,
                liquidity: response.liquidity
            });
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
        _settleBalanceAndDeregister(
            chAddress,
            trader,
            baseToken,
            exchangedPositionSize, // takerBase
            exchangedPositionNotional, // takerQuote
            realizedPnl,
            makerFee.toInt256()
        );
        uint160 currentPrice = GenericLogic.getSqrtMarkX96(chAddress, baseToken);
        int256 openNotional = GenericLogic.getTakerOpenNotional(chAddress, trader, baseToken); // openNotional
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

    function _settleBalanceAndDeregister(
        address chAddress,
        address trader,
        address baseToken,
        int256 takerBase,
        int256 takerQuote,
        int256 realizedPnl,
        int256 makerFee
    ) internal {
        IAccountBalance(IClearingHouse(chAddress).getAccountBalance()).settleBalanceAndDeregister(
            trader,
            baseToken,
            takerBase,
            takerQuote,
            realizedPnl,
            makerFee
        );
    }

    function removeLiquidity(
        address chAddress,
        address trader,
        DataTypes.RemoveLiquidityParams calldata params
    ) public returns (DataTypes.RemoveLiquidityResponse memory) {
        // input requirement checks:
        //   baseToken: in Exchange.settleFunding()
        //   lowerTick & upperTick: in UniswapV3Pool._modifyPosition()
        //   liquidity: in LiquidityMath.addDelta()
        //   minBase, minQuote & deadline: here

        // CH_MP: Market paused
        require(!IBaseToken(params.baseToken).isPaused(), "CH_MP");

        // must settle funding first

        IOrderBook.RemoveLiquidityResponse memory response = IOrderBook(IClearingHouse(chAddress).getOrderBook())
            .removeLiquidity(
                IOrderBook.RemoveLiquidityParams({
                    maker: trader,
                    baseToken: params.baseToken,
                    lowerTick: params.lowerTick,
                    upperTick: params.upperTick,
                    liquidity: params.liquidity
                })
            );

        GenericLogic.checkSlippageAfterLiquidityChange(response.base, params.minBase, response.quote, params.minQuote);

        _modifyPositionAndRealizePnl(
            chAddress,
            trader,
            params.baseToken,
            response.takerBase, // exchangedPositionSize
            response.takerQuote, // exchangedPositionNotional
            response.fee, // makerFee
            0 //takerFee
        );

        emit GenericLogic.LiquidityChanged(
            trader,
            params.baseToken,
            IClearingHouse(chAddress).getQuoteToken(),
            params.lowerTick,
            params.upperTick,
            response.base.neg256(),
            response.quote.neg256(),
            params.liquidity.neg128(),
            response.fee
        );

        return DataTypes.RemoveLiquidityResponse({ quote: response.quote, base: response.base, fee: response.fee });
    }

    function removeAllLiquidity(address chAddress, address maker, address baseToken, bytes32[] memory orderIds) public {
        IOrderBook.RemoveLiquidityResponse memory removeLiquidityResponse;

        uint256 length = orderIds.length;
        for (uint256 i = 0; i < length; i++) {
            OpenOrder.Info memory order = IOrderBook(IClearingHouse(chAddress).getOrderBook()).getOpenOrderById(
                orderIds[i]
            );

            // CH_ONBM: order is not belongs to this maker
            require(
                OpenOrder.calcOrderKey(maker, baseToken, order.lowerTick, order.upperTick) == orderIds[i],
                "CH_ONBM"
            );

            IOrderBook.RemoveLiquidityResponse memory response = IOrderBook(IClearingHouse(chAddress).getOrderBook())
                .removeLiquidity(
                    IOrderBook.RemoveLiquidityParams({
                        maker: maker,
                        baseToken: baseToken,
                        lowerTick: order.lowerTick,
                        upperTick: order.upperTick,
                        liquidity: order.liquidity
                    })
                );

            removeLiquidityResponse.base = removeLiquidityResponse.base.add(response.base);
            removeLiquidityResponse.quote = removeLiquidityResponse.quote.add(response.quote);
            removeLiquidityResponse.fee = removeLiquidityResponse.fee.add(response.fee);
            removeLiquidityResponse.takerBase = removeLiquidityResponse.takerBase.add(response.takerBase);
            removeLiquidityResponse.takerQuote = removeLiquidityResponse.takerQuote.add(response.takerQuote);

            emit GenericLogic.LiquidityChanged(
                maker,
                baseToken,
                IClearingHouse(chAddress).getQuoteToken(),
                order.lowerTick,
                order.upperTick,
                response.base.neg256(),
                response.quote.neg256(),
                order.liquidity.neg128(),
                response.fee
            );
        }

        _modifyPositionAndRealizePnl(
            chAddress,
            maker,
            baseToken,
            removeLiquidityResponse.takerBase,
            removeLiquidityResponse.takerQuote,
            removeLiquidityResponse.fee,
            0
        );
    }
}

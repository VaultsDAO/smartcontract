// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
import { IAccountBalance } from "../interface/IAccountBalance.sol";
import { IClearingHouse } from "../interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "../interface/IClearingHouseConfig.sol";
import { IIndexPrice } from "../interface/IIndexPrice.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { PerpSafeCast } from "./PerpSafeCast.sol";
import { PerpMath } from "./PerpMath.sol";
import { SettlementTokenMath } from "./SettlementTokenMath.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";

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

    // function addLiquidity(
    //     AddLiquidityParams calldata params
    // )
    //     external
    //     override
    //     whenNotPaused
    //     nonReentrant
    //     checkDeadline(params.deadline)
    //     onlyMaker
    //     returns (
    //         // check onlyLiquidityAdmin
    //         AddLiquidityResponse memory
    //     )
    // {
    //     // input requirement checks:
    //     //   baseToken: in Exchange.settleFunding()
    //     //   base & quote: in LiquidityAmounts.getLiquidityForAmounts() -> FullMath.mulDiv()
    //     //   lowerTick & upperTick: in UniswapV3Pool._modifyPosition()
    //     //   minBase, minQuote & deadline: here

    //     _checkMarketOpen(params.baseToken);

    //     // This condition is to prevent the intentional bad debt attack through price manipulation.
    //     // CH_OMPS: Over the maximum price spread
    //     require(!IExchange(_exchange).isOverPriceSpread(params.baseToken), "CH_OMPS");

    //     // CH_DUTB: Disable useTakerBalance
    //     require(!params.useTakerBalance, "CH_DUTB");

    //     address trader = _msgSender();
    //     // register token if it's the first time
    //     _registerBaseToken(trader, params.baseToken);

    //     // must settle funding first
    //     DataTypes.Growth memory fundingGrowthGlobal = _settleFunding(trader, params.baseToken);

    //     // note that we no longer check available tokens here because CH will always auto-mint in UniswapV3MintCallback
    //     IOrderBook.AddLiquidityResponse memory response = IOrderBook(_orderBook).addLiquidity(
    //         IOrderBook.AddLiquidityParams({
    //             trader: trader,
    //             baseToken: params.baseToken,
    //             base: params.base,
    //             quote: params.quote,
    //             lowerTick: params.lowerTick,
    //             upperTick: params.upperTick,
    //             fundingGrowthGlobal: fundingGrowthGlobal
    //         })
    //     );

    //     _checkSlippageAfterLiquidityChange(response.base, params.minBase, response.quote, params.minQuote);

    //     // if !useTakerBalance, takerBalance won't change, only need to collects fee to oweRealizedPnl
    //     if (params.useTakerBalance) {
    //         bool isBaseAdded = response.base != 0;

    //         // can't add liquidity within range from take position
    //         require(isBaseAdded != (response.quote != 0), "CH_CALWRFTP");

    //         AccountMarket.Info memory accountMarketInfo = IAccountBalance(_accountBalance).getAccountInfo(
    //             trader,
    //             params.baseToken
    //         );

    //         // the signs of removedPositionSize and removedOpenNotional are always the opposite.
    //         int256 removedPositionSize;
    //         int256 removedOpenNotional;
    //         if (isBaseAdded) {
    //             // taker base not enough
    //             require(accountMarketInfo.takerPositionSize >= response.base.toInt256(), "CH_TBNE");

    //             removedPositionSize = response.base.neg256();

    //             // move quote debt from taker to maker:
    //             // takerOpenNotional(-) * removedPositionSize(-) / takerPositionSize(+)

    //             // overflow inspection:
    //             // Assume collateral is 2.406159692E28 and index price is 1e-18
    //             // takerOpenNotional ~= 10 * 2.406159692E28 = 2.406159692E29 --> x
    //             // takerPositionSize ~= takerOpenNotional/index price = x * 1e18 = 2.4061597E38
    //             // max of removedPositionSize = takerPositionSize = 2.4061597E38
    //             // (takerOpenNotional * removedPositionSize) < 2^255
    //             // 2.406159692E29 ^2 * 1e18 < 2^255
    //             removedOpenNotional = accountMarketInfo.takerOpenNotional.mul(removedPositionSize).div(
    //                 accountMarketInfo.takerPositionSize
    //             );
    //         } else {
    //             // taker quote not enough
    //             require(accountMarketInfo.takerOpenNotional >= response.quote.toInt256(), "CH_TQNE");

    //             removedOpenNotional = response.quote.neg256();

    //             // move base debt from taker to maker:
    //             // takerPositionSize(-) * removedOpenNotional(-) / takerOpenNotional(+)
    //             // overflow inspection: same as above
    //             removedPositionSize = accountMarketInfo.takerPositionSize.mul(removedOpenNotional).div(
    //                 accountMarketInfo.takerOpenNotional
    //             );
    //         }

    //         // update orderDebt to record the cost of this order
    //         IOrderBook(_orderBook).updateOrderDebt(
    //             OpenOrder.calcOrderKey(trader, params.baseToken, params.lowerTick, params.upperTick),
    //             removedPositionSize,
    //             removedOpenNotional
    //         );

    //         // update takerBalances as we're using takerBalances to provide liquidity
    //         (, int256 takerOpenNotional) = IAccountBalance(_accountBalance).modifyTakerBalance(
    //             trader,
    //             params.baseToken,
    //             removedPositionSize,
    //             removedOpenNotional
    //         );

    //         uint256 sqrtPrice = _getSqrtMarkX96(params.baseToken);
    //         _emitPositionChanged(
    //             trader,
    //             params.baseToken,
    //             removedPositionSize, // exchangedPositionSize
    //             removedOpenNotional, // exchangedPositionNotional
    //             0, // fee
    //             takerOpenNotional, // openNotional
    //             0, // realizedPnl
    //             sqrtPrice // sqrtPriceAfterX96
    //         );
    //     }

    //     // fees always have to be collected to owedRealizedPnl, as long as there is a change in liquidity
    //     _modifyOwedRealizedPnl(trader, response.fee.toInt256());

    //     // after token balances are updated, we can check if there is enough free collateral
    //     _requireEnoughFreeCollateral(trader);

    //     _emitLiquidityChanged(
    //         trader,
    //         params.baseToken,
    //         _quoteToken,
    //         params.lowerTick,
    //         params.upperTick,
    //         response.base.toInt256(),
    //         response.quote.toInt256(),
    //         response.liquidity.toInt128(),
    //         response.fee
    //     );

    //     return
    //         AddLiquidityResponse({
    //             base: response.base,
    //             quote: response.quote,
    //             fee: response.fee,
    //             liquidity: response.liquidity
    //         });
    // }

    /// @param positionSizeToBeLiquidated its direction should be the same as taker's existing position
    // function getLiquidatedPositionSizeAndNotional(
    //     address clearingHouseAddress,
    //     address trader,
    //     address baseToken,
    //     int256 accountValue,
    //     int256 positionSizeToBeLiquidated
    // ) public view returns (int256, int256) {
    //     int256 maxLiquidatablePositionSize = IAccountBalance(IClearingHouse(clearingHouseAddress).getAccountBalance())
    //         .getLiquidatablePositionSize(trader, baseToken, accountValue);

    //     if (positionSizeToBeLiquidated.abs() > maxLiquidatablePositionSize.abs() || positionSizeToBeLiquidated == 0) {
    //         positionSizeToBeLiquidated = maxLiquidatablePositionSize;
    //     }

    //     int256 liquidatedPositionSize = positionSizeToBeLiquidated.neg256();
    //     int256 liquidatedPositionNotional = positionSizeToBeLiquidated.mulDiv(
    //         getIndexPrice(clearingHouseAddress, baseToken).toInt256(),
    //         1e18
    //     );

    //     return (liquidatedPositionSize, liquidatedPositionNotional);
    // }

    // function getIndexPrice(address clearingHouseAddress, address baseToken) public view returns (uint256) {
    //     return
    //         IIndexPrice(baseToken).getIndexPrice(
    //             IClearingHouseConfig(IClearingHouse(clearingHouseAddress).getClearingHouseConfig()).getTwapInterval()
    //         );
    // }

    // function settleBalanceAndDeregister(
    //     address clearingHouseAddress,
    //     address trader,
    //     address baseToken,
    //     int256 takerBase,
    //     int256 takerQuote,
    //     int256 realizedPnl,
    //     int256 makerFee
    // ) public {
    //     IAccountBalance(IClearingHouse(clearingHouseAddress).getAccountBalance()).settleBalanceAndDeregister(
    //         trader,
    //         baseToken,
    //         takerBase,
    //         takerQuote,
    //         realizedPnl,
    //         makerFee
    //     );
    // }
}

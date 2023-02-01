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

        // note that we no longer check available tokens here because CH will always auto-mint in UniswapV3MintCallback
        IOrderBook.AddLiquidityResponse memory response = IOrderBook(IClearingHouse(chAddress).getOrderBook())
            .addLiquidity(IOrderBook.AddLiquidityParams({ baseToken: params.baseToken, liquidity: params.liquidity }));

        emit GenericLogic.LiquidityChanged(
            params.baseToken,
            IClearingHouse(chAddress).getQuoteToken(),
            response.base.toInt256(),
            response.quote.toInt256(),
            response.liquidity.toInt128()
        );

        return
            DataTypes.AddLiquidityResponse({
                base: response.base,
                quote: response.quote,
                liquidity: response.liquidity
            });
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
        DataTypes.RemoveLiquidityParams memory params
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
                IOrderBook.RemoveLiquidityParams({ baseToken: params.baseToken, liquidity: params.liquidity })
            );

        emit GenericLogic.LiquidityChanged(
            params.baseToken,
            IClearingHouse(chAddress).getQuoteToken(),
            response.base.neg256(),
            response.quote.neg256(),
            params.liquidity.neg128()
        );

        return DataTypes.RemoveLiquidityResponse({ quote: response.quote, base: response.base });
    }

    function removeAllLiquidity(address chAddress, address baseToken) public {
        IOrderBook.RemoveLiquidityResponse memory removeLiquidityResponse;

        uint128 liquidity = IOrderBook(IClearingHouse(chAddress).getOrderBook()).getLiquidity(baseToken);

        IOrderBook.RemoveLiquidityResponse memory response = IOrderBook(IClearingHouse(chAddress).getOrderBook())
            .removeLiquidity(IOrderBook.RemoveLiquidityParams({ baseToken: baseToken, liquidity: liquidity }));

        removeLiquidityResponse.base = removeLiquidityResponse.base.add(response.base);
        removeLiquidityResponse.quote = removeLiquidityResponse.quote.add(response.quote);

        emit GenericLogic.LiquidityChanged(
            baseToken,
            IClearingHouse(chAddress).getQuoteToken(),
            response.base.neg256(),
            response.quote.neg256(),
            liquidity.neg128()
        );
    }
}

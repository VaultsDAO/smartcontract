// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { TickMath } from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import { SwapMath } from "@uniswap/v3-core/contracts/libraries/SwapMath.sol";
import { LiquidityMath } from "@uniswap/v3-core/contracts/libraries/LiquidityMath.sol";
import { FixedPoint128 } from "@uniswap/v3-core/contracts/libraries/FixedPoint128.sol";
import { IUniswapV3MintCallback } from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import { LiquidityAmounts } from "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import { UniswapV3Broker } from "./lib/UniswapV3Broker.sol";
import { PerpSafeCast } from "./lib/PerpSafeCast.sol";
import { PerpFixedPoint96 } from "./lib/PerpFixedPoint96.sol";
import { Funding } from "./lib/Funding.sol";
import { PerpMath } from "./lib/PerpMath.sol";
import { Tick } from "./lib/Tick.sol";
import { ClearingHouseCallee } from "./base/ClearingHouseCallee.sol";
import { UniswapV3CallbackBridge } from "./base/UniswapV3CallbackBridge.sol";
import { IMarketRegistry } from "./interface/IMarketRegistry.sol";
import { OrderBookStorageV1 } from "./storage/OrderBookStorage.sol";
import { IOrderBook } from "./interface/IOrderBook.sol";
import { OpenOrder } from "./lib/OpenOrder.sol";
import { DataTypes } from "./types/DataTypes.sol";

import "hardhat/console.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract OrderBook is
    IOrderBook,
    IUniswapV3MintCallback,
    ClearingHouseCallee,
    UniswapV3CallbackBridge,
    OrderBookStorageV1
{
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint128;
    using SignedSafeMathUpgradeable for int256;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for int256;
    using PerpMath for int128;
    using PerpSafeCast for uint256;
    using PerpSafeCast for uint128;
    using PerpSafeCast for int256;

    //
    // STRUCT
    //

    struct InternalAddLiquidityToOrderParams {
        address baseToken;
        address pool;
        int24 lowerTick;
        int24 upperTick;
        uint128 liquidity;
        uint256 base;
        uint256 quote;
    }

    struct InternalRemoveLiquidityParams {
        address baseToken;
        address pool;
        int24 lowerTick;
        int24 upperTick;
        uint128 liquidity;
    }

    struct InternalSwapStep {
        uint160 initialSqrtPriceX96;
        int24 nextTick;
        bool isNextTickInitialized;
        uint160 nextSqrtPriceX96;
        uint256 amountIn;
        uint256 amountOut;
        uint256 fee;
    }

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(address marketRegistryArg) external initializer {
        __ClearingHouseCallee_init();
        __UniswapV3CallbackBridge_init(marketRegistryArg);
    }

    function setExchange(address exchangeArg) external onlyOwner {
        _exchange = exchangeArg;
        emit ExchangeChanged(exchangeArg);
    }

    /// @inheritdoc IOrderBook
    function addLiquidity(AddLiquidityParams calldata params) external override returns (AddLiquidityResponse memory) {
        _requireOnlyClearingHouse();

        address pool = IMarketRegistry(_marketRegistry).getPool(params.baseToken);

        (int24 lowerTick, int24 upperTick) = UniswapV3Broker.getFullTickForLiquidity(pool);

        UniswapV3Broker.AddLiquidityResponse memory response;
        {
            // add liquidity to pool
            response = UniswapV3Broker.addLiquidity(
                UniswapV3Broker.AddLiquidityParams(
                    pool,
                    lowerTick,
                    upperTick,
                    params.liquidity,
                    abi.encode(MintCallbackData(pool))
                )
            );
        }

        // state changes; if adding liquidity to an existing order, get fees accrued
        uint256 fee = _addLiquidityToOrder(
            InternalAddLiquidityToOrderParams({
                baseToken: params.baseToken,
                pool: pool,
                lowerTick: lowerTick,
                upperTick: upperTick,
                liquidity: response.liquidity,
                base: response.base,
                quote: response.quote
            })
        );

        return
            AddLiquidityResponse({
                base: response.base,
                quote: response.quote,
                fee: fee,
                liquidity: response.liquidity,
                lowerTick: lowerTick,
                upperTick: upperTick
            });
    }

    /// @inheritdoc IOrderBook
    function removeLiquidity(
        RemoveLiquidityParams calldata params
    ) external override returns (RemoveLiquidityResponse memory) {
        _requireOnlyClearingHouse();
        address pool = IMarketRegistry(_marketRegistry).getPool(params.baseToken);
        (int24 lowerTick, int24 upperTick) = UniswapV3Broker.getFullTickForLiquidity(pool);
        return
            _removeLiquidity(
                InternalRemoveLiquidityParams({
                    baseToken: params.baseToken,
                    pool: pool,
                    lowerTick: lowerTick,
                    upperTick: upperTick,
                    liquidity: params.liquidity
                })
            );
    }

    /// @inheritdoc IUniswapV3MintCallback
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override checkCallback {
        IUniswapV3MintCallback(_clearingHouse).uniswapV3MintCallback(amount0Owed, amount1Owed, data);
    }

    /// @inheritdoc IOrderBook
    function replaySwap(ReplaySwapParams memory params) external override returns (ReplaySwapResponse memory) {
        _requireOnlyExchange();

        address pool = IMarketRegistry(_marketRegistry).getPool(params.baseToken);
        bool isExactInput = params.amount > 0;
        uint256 fee;

        UniswapV3Broker.SwapState memory swapState = UniswapV3Broker.getSwapState(pool, params.amount);

        params.sqrtPriceLimitX96 = params.sqrtPriceLimitX96 == 0
            ? (params.isBaseToQuote ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
            : params.sqrtPriceLimitX96;

        // if there is residue in amountSpecifiedRemaining, makers can get a tiny little bit less than expected,
        // which is safer for the system
        int24 tickSpacing = UniswapV3Broker.getTickSpacing(pool);

        while (swapState.amountSpecifiedRemaining != 0 && swapState.sqrtPriceX96 != params.sqrtPriceLimitX96) {
            InternalSwapStep memory step;
            step.initialSqrtPriceX96 = swapState.sqrtPriceX96;

            // find next tick
            // note the search is bounded in one word
            (step.nextTick, step.isNextTickInitialized) = UniswapV3Broker.getNextInitializedTickWithinOneWord(
                pool,
                swapState.tick,
                tickSpacing,
                params.isBaseToQuote
            );

            // ensure that we do not overshoot the min/max tick, as the tick bitmap is not aware of these bounds
            if (step.nextTick < TickMath.MIN_TICK) {
                step.nextTick = TickMath.MIN_TICK;
            } else if (step.nextTick > TickMath.MAX_TICK) {
                step.nextTick = TickMath.MAX_TICK;
            }

            // get the next price of this step (either next tick's price or the ending price)
            // use sqrtPrice instead of tick is more precise
            step.nextSqrtPriceX96 = TickMath.getSqrtRatioAtTick(step.nextTick);

            // find the next swap checkpoint
            // (either reached the next price of this step, or exhausted remaining amount specified)
            (swapState.sqrtPriceX96, step.amountIn, step.amountOut, step.fee) = SwapMath.computeSwapStep(
                swapState.sqrtPriceX96,
                (
                    params.isBaseToQuote
                        ? step.nextSqrtPriceX96 < params.sqrtPriceLimitX96
                        : step.nextSqrtPriceX96 > params.sqrtPriceLimitX96
                )
                    ? params.sqrtPriceLimitX96
                    : step.nextSqrtPriceX96,
                swapState.liquidity,
                swapState.amountSpecifiedRemaining,
                // isBaseToQuote: fee is charged in base token in uniswap pool; thus, use uniswapFeeRatio to replay
                // !isBaseToQuote: fee is charged in quote token in clearing house; thus, use exchangeFeeRatioRatio
                params.isBaseToQuote ? params.uniswapFeeRatio : 0
            );

            // user input 1 quote:
            // quote token to uniswap ===> 1*0.98/0.99 = 0.98989899
            // fee = 0.98989899 * 2% = 0.01979798
            if (isExactInput) {
                swapState.amountSpecifiedRemaining = swapState.amountSpecifiedRemaining.sub(
                    step.amountIn.add(step.fee).toInt256()
                );
            } else {
                swapState.amountSpecifiedRemaining = swapState.amountSpecifiedRemaining.add(step.amountOut.toInt256());
            }

            // update CH's global fee growth if there is liquidity in this range
            // note CH only collects quote fee when swapping base -> quote
            if (swapState.liquidity > 0) {
                if (params.isBaseToQuote) {
                    step.fee = FullMath.mulDivRoundingUp(step.amountOut, 0, 1e6);
                }
                fee += step.fee;
            }

            if (swapState.sqrtPriceX96 == step.nextSqrtPriceX96) {
                // we have reached the tick's boundary
                if (step.isNextTickInitialized) {
                    if (params.shouldUpdateState) {}
                    int128 liquidityNet = UniswapV3Broker.getTickLiquidityNet(pool, step.nextTick);
                    if (params.isBaseToQuote) liquidityNet = liquidityNet.neg128();
                    swapState.liquidity = LiquidityMath.addDelta(swapState.liquidity, liquidityNet);
                }

                swapState.tick = params.isBaseToQuote ? step.nextTick - 1 : step.nextTick;
            } else if (swapState.sqrtPriceX96 != step.initialSqrtPriceX96) {
                // update state.tick corresponding to the current price if the price has changed in this step
                swapState.tick = TickMath.getTickAtSqrtRatio(swapState.sqrtPriceX96);
            }
        }

        return ReplaySwapResponse({ tick: swapState.tick, fee: fee });
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IOrderBook
    function getExchange() external view override returns (address) {
        return _exchange;
    }

    /// @inheritdoc IOrderBook
    // function getOpenOrderIds(address trader, address baseToken) external view override returns (bytes32[] memory) {
    //     return _openOrderIdsMap[trader][baseToken];
    // }

    // /// @inheritdoc IOrderBook
    // function getOpenOrderById(bytes32 orderId) external view override returns (OpenOrder.Info memory) {
    //     return _openOrderMap[orderId];
    // }

    /// @inheritdoc IOrderBook
    function getOpenOrder(address baseToken) external view override returns (OpenOrder.Info memory) {
        return _openOrderMap[baseToken];
    }

    /// @inheritdoc IOrderBook
    function hasOrder(address[] calldata tokens) external view override returns (bool) {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (_openOrderMap[tokens[i]].liquidity > 0) {
                return true;
            }
        }
        return false;
    }

    //
    // PUBLIC VIEW
    //

    //
    // INTERNAL NON-VIEW
    //

    function _removeLiquidity(
        InternalRemoveLiquidityParams memory params
    ) internal returns (RemoveLiquidityResponse memory) {
        UniswapV3Broker.RemoveLiquidityResponse memory response = UniswapV3Broker.removeLiquidity(
            UniswapV3Broker.RemoveLiquidityParams(
                params.pool,
                _clearingHouse,
                params.lowerTick,
                params.upperTick,
                params.liquidity
            )
        );

        // update token info based on existing open order
        (uint256 fee, uint256 baseDebt, uint256 quoteDebt) = _removeLiquidityFromOrder(params);

        int256 takerBase = response.base.toInt256().sub(baseDebt.toInt256());
        int256 takerQuote = response.quote.toInt256().sub(quoteDebt.toInt256());

        // if flipped from initialized to uninitialized, clear the tick info
        if (!UniswapV3Broker.getIsTickInitialized(params.pool, params.lowerTick)) {}
        if (!UniswapV3Broker.getIsTickInitialized(params.pool, params.upperTick)) {}

        return
            RemoveLiquidityResponse({
                base: response.base,
                quote: response.quote,
                fee: fee,
                takerBase: takerBase,
                takerQuote: takerQuote,
                lowerTick: params.lowerTick,
                upperTick: params.upperTick
            });
    }

    function _removeLiquidityFromOrder(
        InternalRemoveLiquidityParams memory params
    ) internal returns (uint256 fee, uint256 baseDebt, uint256 quoteDebt) {
        // update token info based on existing open order
        OpenOrder.Info storage openOrder = _openOrderMap[params.baseToken];

        if (params.liquidity != 0) {
            openOrder.liquidity = openOrder.liquidity.sub(params.liquidity).toUint128();
        }

        // after the fee is calculated, lastFeeGrowthInsideX128 can be updated if liquidity != 0 after removing
        if (openOrder.liquidity == 0) {
            _removeOrder(params.baseToken);
        }

        return (0, baseDebt, quoteDebt);
    }

    function _removeOrder(address baseToken) internal {
        delete _openOrderMap[baseToken];
    }

    /// @dev this function is extracted from and only used by addLiquidity() to avoid stack too deep error
    function _addLiquidityToOrder(InternalAddLiquidityToOrderParams memory params) internal returns (uint256) {
        // get the struct by key, no matter it's a new or existing order
        OpenOrder.Info storage openOrder = _openOrderMap[params.baseToken];

        // initialization for a new order
        if (openOrder.liquidity == 0) {
            openOrder.lowerTick = params.lowerTick;
            openOrder.upperTick = params.upperTick;
        }

        // after the fee is calculated, liquidity & lastFeeGrowthInsideX128 can be updated
        openOrder.liquidity = openOrder.liquidity.add(params.liquidity).toUint128();

        return 0;
    }

    //
    // INTERNAL VIEW
    //

    function _requireOnlyExchange() internal view {
        // OB_OEX: Only exchange
        require(_msgSender() == _exchange, "OB_OEX");
    }

    // function getAmount0Amount1ForLiquidity(
    //     address baseToken,
    //     int24 lowerTick,
    //     int24 upperTick,
    //     uint128 liquidity
    // ) external view returns (uint256 addedAmount0, uint256 addedAmount1) {
    //     address pool = IMarketRegistry(_marketRegistry).getPool(baseToken);
    //     return UniswapV3Broker.getAmount0Amount1ForLiquidity(pool, lowerTick, upperTick, liquidity);
    // }
}

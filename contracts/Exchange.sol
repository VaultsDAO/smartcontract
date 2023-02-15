// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { TickMath } from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import { IUniswapV3SwapCallback } from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import { BlockContext } from "./base/BlockContext.sol";
import { UniswapV3Broker } from "./lib/UniswapV3Broker.sol";
import { PerpSafeCast } from "./lib/PerpSafeCast.sol";
import { SwapMath } from "./lib/SwapMath.sol";
import { PerpFixedPoint96 } from "./lib/PerpFixedPoint96.sol";
import { PerpMath } from "./lib/PerpMath.sol";
import { AccountMarket } from "./lib/AccountMarket.sol";
import { ClearingHouseCallee } from "./base/ClearingHouseCallee.sol";
import { UniswapV3CallbackBridge } from "./base/UniswapV3CallbackBridge.sol";
import { IOrderBook } from "./interface/IOrderBook.sol";
import { IMarketRegistry } from "./interface/IMarketRegistry.sol";
import { IAccountBalance } from "./interface/IAccountBalance.sol";
import { IClearingHouseConfig } from "./interface/IClearingHouseConfig.sol";
import { IIndexPrice } from "./interface/IIndexPrice.sol";
import { IBaseToken } from "./interface/IBaseToken.sol";
import { ExchangeStorageV2 } from "./storage/ExchangeStorage.sol";
import { IExchange } from "./interface/IExchange.sol";
import { DataTypes } from "./types/DataTypes.sol";
import { GenericLogic } from "./lib/GenericLogic.sol";
import { ExchangeLogic } from "./lib/ExchangeLogic.sol";
import { FundingLogic } from "./lib/FundingLogic.sol";
import "hardhat/console.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Exchange is
    IUniswapV3SwapCallback,
    IExchange,
    BlockContext,
    ClearingHouseCallee,
    UniswapV3CallbackBridge,
    ExchangeStorageV2
{
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using SignedSafeMathUpgradeable for int24;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;

    //
    // STRUCT
    //

    struct InternalReplaySwapParams {
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint160 sqrtPriceLimitX96;
    }

    //
    // CONSTANT
    //

    uint256 internal constant _FULLY_CLOSED_RATIO = 1e18;
    // uint24 internal constant _MAX_TICK_CROSSED_WITHIN_BLOCK_CAP = 1000; // 10%
    uint24 internal constant _MAX_TICK_CROSSED_WITHIN_BLOCK_CAP = 1774544;
    uint24 internal constant _MAX_PRICE_SPREAD_RATIO = 0.05e6; // 5% in decimal 6
    uint256 internal constant _PRICE_LIMIT_INTERVAL = 15; // 15 sec

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        address marketRegistryArg,
        address orderBookArg,
        address clearingHouseConfigArg
    ) external initializer {
        __ClearingHouseCallee_init();
        __UniswapV3CallbackBridge_init(marketRegistryArg);

        // E_OBNC: OrderBook is not contract
        require(orderBookArg.isContract(), "E_OBNC");
        // E_CHNC: CH is not contract
        require(clearingHouseConfigArg.isContract(), "E_CHNC");

        // update states
        _orderBook = orderBookArg;
        _clearingHouseConfig = clearingHouseConfigArg;
    }

    /// @param accountBalanceArg: AccountBalance contract address
    function setAccountBalance(address accountBalanceArg) external onlyOwner {
        // accountBalance  0
        require(accountBalanceArg != address(0), "E_AB0");
        _accountBalance = accountBalanceArg;
        emit AccountBalanceChanged(accountBalanceArg);
    }

    /// @dev Restrict the price impact by setting the ticks can be crossed within a block when
    /// trader reducing liquidity. It is used to prevent the malicious behavior of the malicious traders.
    /// The restriction is applied in _isOverPriceLimitWithTick()
    /// @param baseToken The base token address
    /// @param maxTickCrossedWithinBlock The maximum ticks can be crossed within a block
    function setMaxTickCrossedWithinBlock(address baseToken, uint24 maxTickCrossedWithinBlock) external onlyOwner {
        // EX_BNC: baseToken is not contract
        require(baseToken.isContract(), "EX_BNC");
        // EX_BTNE: base token does not exists
        require(IMarketRegistry(_marketRegistry).hasPool(baseToken), "EX_BTNE");

        // tick range is [MIN_TICK, MAX_TICK], maxTickCrossedWithinBlock should be in [0, MAX_TICK - MIN_TICK]
        // EX_MTCLOOR: max tick crossed limit out of range
        require(maxTickCrossedWithinBlock <= _getMaxTickCrossedWithinBlockCap(), "EX_MTCLOOR");

        _maxTickCrossedWithinBlockMap[baseToken] = maxTickCrossedWithinBlock;
        emit MaxTickCrossedWithinBlockChanged(baseToken, maxTickCrossedWithinBlock);
    }

    /// @inheritdoc IUniswapV3SwapCallback
    /// @dev This callback is forwarded to ClearingHouse.uniswapV3SwapCallback() because all the tokens
    /// are stored in there.
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override checkCallback {
        IUniswapV3SwapCallback(_clearingHouse).uniswapV3SwapCallback(amount0Delta, amount1Delta, data);
    }

    function internalSwap(SwapParams memory params) external override returns (SwapResponse memory) {
        _requireOnlyClearingHouse();
        ExchangeLogic.InternalSwapResponse memory response = _swap(params);
        return
            SwapResponse({
                base: response.base.abs(),
                quote: response.quote.abs(),
                exchangedPositionSize: response.exchangedPositionSize,
                exchangedPositionNotional: response.exchangedPositionNotional,
                insuranceFundFee: 0,
                platformFundFee: 0,
                pnlToBeRealized: 0,
                sqrtPriceAfterX96: 0,
                tick: response.tick,
                isPartialClose: false
            });
    }

    /// @param params The parameters of the swap
    /// @return The result of the swap
    /// @dev can only be called from ClearingHouse
    /// @inheritdoc IExchange
    function swap(SwapParams memory params) external override returns (SwapResponse memory) {
        _requireOnlyClearingHouse();

        // EX_MIP: market is paused
        require(_maxTickCrossedWithinBlockMap[params.baseToken] > 0, "EX_MIP");

        int256 takerPositionSize = IAccountBalance(_accountBalance).getTakerPositionSize(
            params.trader,
            params.baseToken
        );

        bool isPartialClose;
        bool isOverPriceLimit = _isOverPriceLimit(params.baseToken);
        // if over price limit when
        // 1. closing a position, then partially close the position
        // 2. else then revert
        if (params.isClose && takerPositionSize != 0) {
            // if trader is on long side, baseToQuote: true, exactInput: true
            // if trader is on short side, baseToQuote: false (quoteToBase), exactInput: false (exactOutput)
            // simulate the tx to see if it _isOverPriceLimit; if true, can partially close the position only once
            // if this is not the first tx in this timestamp and it's already over limit,
            // then use _isOverPriceLimit is enough
            if (
                isOverPriceLimit ||
                _isOverPriceLimitBySimulatingClosingPosition(
                    params.baseToken,
                    takerPositionSize < 0, // it's a short position
                    params.amount // it's the same as takerPositionSize but in uint256
                )
            ) {
                uint256 timestamp = _blockTimestamp();
                // EX_AOPLO: already over price limit once
                require(timestamp != _lastOverPriceLimitTimestampMap[params.trader][params.baseToken], "EX_AOPLO");

                _lastOverPriceLimitTimestampMap[params.trader][params.baseToken] = timestamp;

                uint24 partialCloseRatio = IClearingHouseConfig(_clearingHouseConfig).getPartialCloseRatio();
                params.amount = params.amount.mulRatio(partialCloseRatio);
                isPartialClose = true;
            }
        } else {
            // EX_OPLBS: over price limit before swap
            require(!isOverPriceLimit, "EX_OPLBS");
        }
        // check fee ratio before swap
        uint256 insuranceFundFeeRatio = getInsuranceFundFeeRatio(params.baseToken, params.isBaseToQuote);
        // get openNotional before swap
        int256 oldTakerOpenNotional = IAccountBalance(_accountBalance).getTakerOpenNotional(
            params.trader,
            params.baseToken
        );
        ExchangeLogic.InternalSwapResponse memory response = _swap(params);

        // if (!params.isClose) {
        // over price limit after swap
        require(!_isOverPriceLimitWithTick(params.baseToken, response.tick), "EX_OPLAS");
        // }

        // updateOverPriceSpreadTimestamp for repeg
        _updateOverPriceSpreadTimestamp(params.baseToken);

        // when takerPositionSize < 0, it's a short position
        bool isReducingPosition = takerPositionSize == 0 ? false : takerPositionSize < 0 != params.isBaseToQuote;
        // when reducing/not increasing the position size, it's necessary to realize pnl
        int256 pnlToBeRealized;
        if (isReducingPosition) {
            pnlToBeRealized = GenericLogic.getPnlToBeRealized(
                GenericLogic.InternalRealizePnlParams({
                    trader: params.trader,
                    baseToken: params.baseToken,
                    takerPositionSize: takerPositionSize,
                    takerOpenNotional: oldTakerOpenNotional,
                    base: response.base,
                    quote: response.quote
                })
            );
        }

        (uint256 sqrtPriceX96, , , , , , ) = UniswapV3Broker.getSlot0(
            IMarketRegistry(_marketRegistry).getPool(params.baseToken)
        );

        // calculate fee
        IMarketRegistry.MarketInfo memory marketInfo = IMarketRegistry(_marketRegistry).getMarketInfo(params.baseToken);
        // platformFundFee
        uint256 platformFundFee = FullMath.mulDivRoundingUp(
            response.exchangedPositionNotional.abs(),
            marketInfo.platformFundFeeRatio,
            1e6
        );
        // insuranceFundFee
        uint256 insuranceFundFee = FullMath.mulDiv(
            response.exchangedPositionNotional.abs(),
            insuranceFundFeeRatio,
            1e6
        );

        return
            SwapResponse({
                base: response.base.abs(),
                quote: response.quote.abs(),
                exchangedPositionSize: response.exchangedPositionSize,
                exchangedPositionNotional: response.exchangedPositionNotional,
                insuranceFundFee: insuranceFundFee,
                platformFundFee: platformFundFee,
                pnlToBeRealized: pnlToBeRealized,
                sqrtPriceAfterX96: sqrtPriceX96,
                tick: response.tick,
                isPartialClose: isPartialClose
            });
    }

    /// @inheritdoc IExchange
    function settleFundingGlobal(
        address baseToken
    ) external override returns (DataTypes.Growth memory fundingGrowthGlobal) {
        _requireOnlyClearingHouse();
        // EX_BTNE: base token does not exists
        require(IMarketRegistry(_marketRegistry).hasPool(baseToken), "EX_BTNE");

        // if updating TWAP fails, this call will be reverted and thus using try-catch
        try IBaseToken(baseToken).cacheTwap(IClearingHouseConfig(_clearingHouseConfig).getTwapInterval()) {} catch {}
        uint256 markTwap;
        uint256 indexTwap;
        (fundingGrowthGlobal, markTwap, indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);

        // funding will be stopped once the market is being paused
        uint256 timestamp = IBaseToken(baseToken).isOpen()
            ? _blockTimestamp()
            : IBaseToken(baseToken).getPausedTimestamp();

        // update states before further actions in this block; once per block
        if (timestamp != _lastSettledTimestampMap[baseToken]) {
            // update fundingGrowthGlobal and _lastSettledTimestamp
            DataTypes.Growth storage lastFundingGrowthGlobal = _globalFundingGrowthX96Map[baseToken];
            (
                _lastSettledTimestampMap[baseToken],
                lastFundingGrowthGlobal.twLongPremiumX96,
                lastFundingGrowthGlobal.twShortPremiumX96
            ) = (timestamp, fundingGrowthGlobal.twLongPremiumX96, fundingGrowthGlobal.twShortPremiumX96);

            (uint256 longPositionSize, uint256 shortPositionSize) = IAccountBalance(_accountBalance)
                .getMarketPositionSize(baseToken);

            emit FundingUpdated(baseToken, markTwap, indexTwap, longPositionSize, shortPositionSize);

            // update tick & timestamp for price limit check
            // if timestamp diff < _PRICE_LIMIT_INTERVAL, including when the market is paused, they won't get updated
            uint256 lastTickUpdatedTimestamp = _lastTickUpdatedTimestampMap[baseToken];
            if (timestamp >= lastTickUpdatedTimestamp.add(_PRICE_LIMIT_INTERVAL)) {
                _lastTickUpdatedTimestampMap[baseToken] = timestamp;
                _lastUpdatedTickMap[baseToken] = _getTick(baseToken);
            }
        }

        return (fundingGrowthGlobal);
    }

    /// @inheritdoc IExchange
    function settleFunding(
        address trader,
        address baseToken
    ) external override returns (int256 fundingPayment, DataTypes.Growth memory fundingGrowthGlobal) {
        _requireOnlyClearingHouse();
        // EX_BTNE: base token does not exists
        require(IMarketRegistry(_marketRegistry).hasPool(baseToken), "EX_BTNE");

        // if updating TWAP fails, this call will be reverted and thus using try-catch
        try IBaseToken(baseToken).cacheTwap(IClearingHouseConfig(_clearingHouseConfig).getTwapInterval()) {} catch {}
        uint256 markTwap;
        uint256 indexTwap;
        (fundingGrowthGlobal, markTwap, indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);

        fundingPayment = FundingLogic.calcPendingFundingPaymentWithLiquidityCoefficient(
            IAccountBalance(_accountBalance).getOriginBase(trader, baseToken),
            IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken).lastLongTwPremiumGrowthGlobalX96,
            IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken).lastShortTwPremiumGrowthGlobalX96,
            fundingGrowthGlobal
        );

        // funding will be stopped once the market is being paused
        uint256 timestamp = IBaseToken(baseToken).isOpen()
            ? _blockTimestamp()
            : IBaseToken(baseToken).getPausedTimestamp();

        // update states before further actions in this block; once per block
        if (timestamp != _lastSettledTimestampMap[baseToken]) {
            // update fundingGrowthGlobal and _lastSettledTimestamp
            DataTypes.Growth storage lastFundingGrowthGlobal = _globalFundingGrowthX96Map[baseToken];
            (
                _lastSettledTimestampMap[baseToken],
                lastFundingGrowthGlobal.twLongPremiumX96,
                lastFundingGrowthGlobal.twShortPremiumX96
            ) = (timestamp, fundingGrowthGlobal.twLongPremiumX96, fundingGrowthGlobal.twShortPremiumX96);

            (uint256 longPositionSize, uint256 shortPositionSize) = IAccountBalance(_accountBalance)
                .getMarketPositionSize(baseToken);

            emit FundingUpdated(baseToken, markTwap, indexTwap, longPositionSize, shortPositionSize);

            // update tick for price limit checks
            _lastUpdatedTickMap[baseToken] = _getTick(baseToken);
        }

        return (fundingPayment, fundingGrowthGlobal);
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IExchange
    function getOrderBook() external view override returns (address) {
        return _orderBook;
    }

    /// @inheritdoc IExchange
    function getAccountBalance() external view override returns (address) {
        return _accountBalance;
    }

    /// @inheritdoc IExchange
    function getClearingHouseConfig() external view override returns (address) {
        return _clearingHouseConfig;
    }

    /// @inheritdoc IExchange
    function getMaxTickCrossedWithinBlock(address baseToken) external view override returns (uint24) {
        return _maxTickCrossedWithinBlockMap[baseToken];
    }

    /// @inheritdoc IExchange
    function getPnlToBeRealized(RealizePnlParams memory params) external view override returns (int256) {
        DataTypes.AccountMarketInfo memory info = IAccountBalance(_accountBalance).getAccountInfo(
            params.trader,
            params.baseToken
        );

        int256 takerOpenNotional = info.takerOpenNotional;
        int256 takerPositionSize = info.takerPositionSize;
        // when takerPositionSize < 0, it's a short position; when base < 0, isBaseToQuote(shorting)
        bool isReducingPosition = takerPositionSize == 0 ? false : takerPositionSize < 0 != params.base < 0;

        return
            isReducingPosition
                ? GenericLogic.getPnlToBeRealized(
                    GenericLogic.InternalRealizePnlParams({
                        trader: params.trader,
                        baseToken: params.baseToken,
                        takerPositionSize: takerPositionSize,
                        takerOpenNotional: takerOpenNotional,
                        base: params.base,
                        quote: params.quote
                    })
                )
                : 0;
    }

    /// @inheritdoc IExchange
    function getAllPendingFundingPayment(address trader) external view override returns (int256 pendingFundingPayment) {
        address[] memory baseTokens = IAccountBalance(_accountBalance).getBaseTokens(trader);
        uint256 baseTokenLength = baseTokens.length;

        for (uint256 i = 0; i < baseTokenLength; i++) {
            pendingFundingPayment = pendingFundingPayment.add(getPendingFundingPayment(trader, baseTokens[i]));
        }
        return pendingFundingPayment;
    }

    /// @inheritdoc IExchange
    function isOverPriceSpread(address baseToken) external view override returns (bool) {
        return _isOverPriceSpread(baseToken);
    }

    function _isOverPriceSpread(address baseToken) internal view returns (bool) {
        uint256 markPrice = getSqrtMarkTwapX96(baseToken, 0).formatSqrtPriceX96ToPriceX96().formatX96ToX10_18();
        uint256 indexTwap = IIndexPrice(baseToken).getIndexPrice(
            IClearingHouseConfig(_clearingHouseConfig).getTwapInterval()
        );
        uint256 spread = markPrice > indexTwap ? markPrice.sub(indexTwap) : indexTwap.sub(markPrice);
        // get market info
        IMarketRegistry.MarketInfo memory marketInfo = IMarketRegistry(_marketRegistry).getMarketInfo(baseToken);
        //
        return spread > PerpMath.mulRatio(indexTwap, marketInfo.unhealthyDeltaTwapRatio);
    }

    //
    // PUBLIC VIEW
    //

    /// @inheritdoc IExchange
    function getPendingFundingPayment(address trader, address baseToken) public view override returns (int256) {
        (DataTypes.Growth memory fundingGrowthGlobal, , ) = _getFundingGrowthGlobalAndTwaps(baseToken);
        return
            FundingLogic.calcPendingFundingPaymentWithLiquidityCoefficient(
                IAccountBalance(_accountBalance).getOriginBase(trader, baseToken),
                IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken).lastLongTwPremiumGrowthGlobalX96,
                IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken).lastShortTwPremiumGrowthGlobalX96,
                fundingGrowthGlobal
            );
    }

    /// @inheritdoc IExchange
    function getSqrtMarkTwapX96(address baseToken, uint32 twapInterval) public view override returns (uint160) {
        return UniswapV3Broker.getSqrtMarkTwapX96(IMarketRegistry(_marketRegistry).getPool(baseToken), twapInterval);
    }

    //
    // INTERNAL NON-VIEW
    //

    /// @dev this function is used only when closePosition()
    ///      inspect whether a tx will go over price limit by simulating closing position before swapping
    function _isOverPriceLimitBySimulatingClosingPosition(
        address baseToken,
        bool isOldPositionShort,
        uint256 positionSize
    ) internal view returns (bool) {
        // to simulate closing position, isOldPositionShort -> quote to exact base/long; else, exact base to quote/short
        return
            _isOverPriceLimitWithTick(
                baseToken,
                _replaySwap(
                    InternalReplaySwapParams({
                        baseToken: baseToken,
                        isBaseToQuote: !isOldPositionShort,
                        isExactInput: !isOldPositionShort,
                        amount: positionSize,
                        sqrtPriceLimitX96: _getSqrtPriceLimitForReplaySwap(baseToken, isOldPositionShort)
                    })
                )
            );
    }

    /// @return tick the resulting tick (derived from price) after replaying the swap
    function _replaySwap(InternalReplaySwapParams memory params) internal view returns (int24 tick) {
        IMarketRegistry.MarketInfo memory marketInfo = IMarketRegistry(_marketRegistry).getMarketInfo(params.baseToken);
        uint24 uniswapFeeRatio = marketInfo.uniswapFeeRatio;
        (, int256 signedScaledAmountForReplaySwap) = SwapMath.calcScaledAmountForSwaps(
            params.isBaseToQuote,
            params.isExactInput,
            params.amount,
            uniswapFeeRatio
        );

        // globalFundingGrowth can be empty if shouldUpdateState is false
        IOrderBook.ReplaySwapResponse memory response = IOrderBook(_orderBook).replaySwap(
            IOrderBook.ReplaySwapParams({
                baseToken: params.baseToken,
                isBaseToQuote: params.isBaseToQuote,
                amount: signedScaledAmountForReplaySwap,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                uniswapFeeRatio: uniswapFeeRatio,
                shouldUpdateState: false
            })
        );
        return response.tick;
    }

    /// @dev customized fee: https://www.notion.so/perp/Customise-fee-tier-on-B2QFee-1b7244e1db63416c8651e8fa04128cdb
    function _swap(SwapParams memory params) internal returns (ExchangeLogic.InternalSwapResponse memory) {
        ExchangeLogic.InternalSwapResponse memory res = ExchangeLogic.swap(_clearingHouse, params);
        if (_firstTradedTimestampMap[params.baseToken] == 0) {
            _firstTradedTimestampMap[params.baseToken] = _blockTimestamp();
        }
        return res;
    }

    //
    // INTERNAL VIEW
    //

    function _isOverPriceLimit(address baseToken) internal view returns (bool) {
        int24 tick = _getTick(baseToken);
        return _isOverPriceLimitWithTick(baseToken, tick);
    }

    function _isOverPriceLimitWithTick(address baseToken, int24 tick) internal view returns (bool) {
        uint24 maxDeltaTick = _maxTickCrossedWithinBlockMap[baseToken];
        int24 lastUpdatedTick = _lastUpdatedTickMap[baseToken];
        // no overflow/underflow issue because there are range limits for tick and maxDeltaTick
        int24 upperTickBound = lastUpdatedTick.add(maxDeltaTick).toInt24();
        int24 lowerTickBound = lastUpdatedTick.sub(maxDeltaTick).toInt24();
        return (tick < lowerTickBound || tick > upperTickBound);
    }

    function _getTick(address baseToken) internal view returns (int24) {
        (, int24 tick, , , , , ) = UniswapV3Broker.getSlot0(IMarketRegistry(_marketRegistry).getPool(baseToken));
        return tick;
    }

    struct InternalFundingGrowthGlobalAndTwapsVars {
        uint256 longPositionSize;
        uint256 shortPositionSize;
        uint256 longMultiplier;
        uint256 shortMultiplier;
    }

    /// @dev this function calculates the up-to-date globalFundingGrowth and twaps and pass them out
    /// @return fundingGrowthGlobal the up-to-date globalFundingGrowth
    /// @return markTwap only for settleFunding()
    /// @return indexTwap only for settleFunding()

    function _getFundingGrowthGlobalAndTwaps(
        address baseToken
    ) internal view returns (DataTypes.Growth memory fundingGrowthGlobal, uint256 markTwap, uint256 indexTwap) {
        uint256 timestamp = IBaseToken(baseToken).isOpen()
            ? _blockTimestamp()
            : IBaseToken(baseToken).getPausedTimestamp();
        return
            FundingLogic.getFundingGrowthGlobalAndTwaps(
                _clearingHouse,
                baseToken,
                _firstTradedTimestampMap[baseToken],
                _lastSettledTimestampMap[baseToken],
                timestamp,
                _globalFundingGrowthX96Map[baseToken]
            );
    }

    /// @dev get a price limit for replaySwap s.t. it can stop when reaching the limit to save gas
    function _getSqrtPriceLimitForReplaySwap(address baseToken, bool isLong) internal view returns (uint160) {
        int24 lastUpdatedTick = _lastUpdatedTickMap[baseToken];
        uint24 maxDeltaTick = _maxTickCrossedWithinBlockMap[baseToken];

        // price limit = max tick + 1 or min tick - 1, depending on which direction
        int24 tickBoundary = isLong
            ? lastUpdatedTick + int24(maxDeltaTick) + 1
            : lastUpdatedTick - int24(maxDeltaTick) - 1;

        // tickBoundary should be in [MIN_TICK, MAX_TICK]
        tickBoundary = tickBoundary > TickMath.MAX_TICK ? TickMath.MAX_TICK : tickBoundary;
        tickBoundary = tickBoundary < TickMath.MIN_TICK ? TickMath.MIN_TICK : tickBoundary;

        return TickMath.getSqrtRatioAtTick(tickBoundary);
    }

    // @dev use virtual for testing
    function _getMaxTickCrossedWithinBlockCap() internal pure virtual returns (uint24) {
        return _MAX_TICK_CROSSED_WITHIN_BLOCK_CAP;
    }

    function getInsuranceFundFeeRatio(address baseToken, bool isBaseToQuote) public view returns (uint256) {
        return GenericLogic.getInsuranceFundFeeRatio(address(this), _marketRegistry, baseToken, isBaseToQuote);
    }

    function getGlobalFundingGrowthInfo(
        address baseToken
    ) public view returns (uint256 lastSettledTimestamp, DataTypes.Growth memory fundingGrowthGlobal) {
        lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        fundingGrowthGlobal = _globalFundingGrowthX96Map[baseToken];
    }

    function getFundingGrowthGlobalAndTwaps(
        address baseToken
    )
        external
        view
        override
        returns (DataTypes.Growth memory fundingGrowthGlobal, uint256 markTwap, uint256 indexTwap)
    {
        (fundingGrowthGlobal, markTwap, indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);
    }

    // OverPriceSpreadTimestamp
    function updateOverPriceSpreadTimestamp(address baseToken) external override {
        _updateOverPriceSpreadTimestamp(baseToken);
    }

    function _updateOverPriceSpreadTimestamp(address baseToken) internal {
        if (_isOverPriceSpread(baseToken)) {
            if (_lastOverPriceSpreadTimestampMap[baseToken] == 0) {
                _lastOverPriceSpreadTimestampMap[baseToken] = _blockTimestamp();
            }
        } else {
            _lastOverPriceSpreadTimestampMap[baseToken] = 0;
        }
    }

    function isOverPriceSpreadTimestamp(address baseToken) external view override returns (bool) {
        return
            _lastOverPriceSpreadTimestampMap[baseToken] > 0 &&
            _lastOverPriceSpreadTimestampMap[baseToken] <=
            (_blockTimestamp() - IClearingHouseConfig(_clearingHouseConfig).getDurationRepegOverPriceSpread());
    }

    function getOverPriceSpreadTimestamp(address baseToken) external view returns (uint256) {
        return _lastOverPriceSpreadTimestampMap[baseToken];
    }

    function getOverPriceSpreadInfo(
        address baseToken
    ) external view returns (uint256 spreadRatio, uint256 lastOverPriceSpreadTimestamp, uint256 repegTimestamp) {
        uint256 markPrice = getSqrtMarkTwapX96(baseToken, 0).formatSqrtPriceX96ToPriceX96().formatX96ToX10_18();
        uint256 indexTwap = IIndexPrice(baseToken).getIndexPrice(
            IClearingHouseConfig(_clearingHouseConfig).getTwapInterval()
        );
        spreadRatio = (markPrice > indexTwap ? markPrice.sub(indexTwap) : indexTwap.sub(markPrice)).mul(1e6).div(
            indexTwap
        );
        lastOverPriceSpreadTimestamp = _lastOverPriceSpreadTimestampMap[baseToken];
        repegTimestamp =
            lastOverPriceSpreadTimestamp +
            IClearingHouseConfig(_clearingHouseConfig).getDurationRepegOverPriceSpread();
    }

    function estimateSwap(
        DataTypes.OpenPositionParams memory params
    ) external view override returns (IOrderBook.ReplaySwapResponse memory) {
        return ExchangeLogic.estimateSwap(_clearingHouse, params);
    }
}

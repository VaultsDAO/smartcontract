// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import { IUniswapV3MintCallback } from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";
import { IUniswapV3SwapCallback } from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { PerpSafeCast } from "./lib/PerpSafeCast.sol";
import { PerpMath } from "./lib/PerpMath.sol";
import { SettlementTokenMath } from "./lib/SettlementTokenMath.sol";
import { Funding } from "./lib/Funding.sol";
import { OwnerPausable } from "./base/OwnerPausable.sol";
import { IERC20Metadata } from "./interface/IERC20Metadata.sol";
import { IVault } from "./interface/IVault.sol";
import { IExchange } from "./interface/IExchange.sol";
import { IOrderBook } from "./interface/IOrderBook.sol";
import { IIndexPrice } from "./interface/IIndexPrice.sol";
import { IClearingHouseConfig } from "./interface/IClearingHouseConfig.sol";
import { IAccountBalance } from "./interface/IAccountBalance.sol";
import { IInsuranceFund } from "./interface/IInsuranceFund.sol";
import { IBaseToken } from "./interface/IBaseToken.sol";
import { IIndexPrice } from "./interface/IIndexPrice.sol";
import { IDelegateApproval } from "./interface/IDelegateApproval.sol";
import { BaseRelayRecipient } from "./gsn/BaseRelayRecipient.sol";
import { ClearingHouseStorage } from "./storage/ClearingHouseStorage.sol";
import { BlockContext } from "./base/BlockContext.sol";
import { IClearingHouse } from "./interface/IClearingHouse.sol";
import { AccountMarket } from "./lib/AccountMarket.sol";
import { OpenOrder } from "./lib/OpenOrder.sol";
import { LiquidityLogic } from "./lib/LiquidityLogic.sol";
import { ExchangeLogic } from "./lib/ExchangeLogic.sol";
import { GenericLogic } from "./lib/GenericLogic.sol";
import { IMarketRegistry } from "./interface/IMarketRegistry.sol";
import { DataTypes } from "./types/DataTypes.sol";
import { UniswapV3Broker } from "./lib/UniswapV3Broker.sol";
import "hardhat/console.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract ClearingHouse is
    IUniswapV3MintCallback,
    IUniswapV3SwapCallback,
    IClearingHouse,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    BaseRelayRecipient,
    ClearingHouseStorage
{
    using AddressUpgradeable for address;
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

    //
    // STRUCT
    //

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

    struct InternalCheckSlippageParams {
        bool isBaseToQuote;
        bool isExactInput;
        uint256 base;
        uint256 quote;
        uint256 oppositeAmountBound;
    }

    //
    // MODIFIER
    //

    modifier checkDeadline(uint256 deadline) {
        // transaction expires
        require(_blockTimestamp() <= deadline, "CH_TE");
        _;
    }

    modifier onlyMaker() {
        // only maker
        require(_msgSender() == _maker, "CH_OM");
        _;
    }

    function _requireMaker(address maker) internal view {
        // only Maker
        require(maker == _maker, "CH_OM");
    }

    function _requireNotMaker(address maker) internal view {
        // not Maker
        require(maker != _maker, "CH_NM");
    }

    //
    // EXTERNAL NON-VIEW
    //

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address clearingHouseConfigArg,
        address vaultArg,
        address quoteTokenArg,
        address uniV3FactoryArg,
        address exchangeArg,
        address accountBalanceArg,
        address marketRegistryArg,
        address insuranceFundArg,
        address platformFundArg,
        address makerArg
    ) public initializer {
        // CH_VANC: Vault address is not contract
        _isContract(vaultArg, "CH_VANC");
        // CH_QANC: QuoteToken address is not contract
        _isContract(quoteTokenArg, "CH_QANC");
        // CH_QDN18: QuoteToken decimals is not 18
        require(IERC20Metadata(quoteTokenArg).decimals() == 18, "CH_QDN18");
        // CH_UANC: UniV3Factory address is not contract
        _isContract(uniV3FactoryArg, "CH_UANC");
        // ClearingHouseConfig address is not contract
        _isContract(clearingHouseConfigArg, "CH_CCNC");
        // AccountBalance is not contract
        _isContract(accountBalanceArg, "CH_ABNC");
        // CH_ENC: Exchange is not contract
        _isContract(exchangeArg, "CH_ENC");
        // CH_IFANC: InsuranceFund address is not contract
        _isContract(insuranceFundArg, "CH_IFANC");

        address orderBookArg = IExchange(exchangeArg).getOrderBook();
        // orderBook is not contract
        _isContract(orderBookArg, "CH_OBNC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _clearingHouseConfig = clearingHouseConfigArg;
        _vault = vaultArg;
        _quoteToken = quoteTokenArg;
        _uniswapV3Factory = uniV3FactoryArg;
        _exchange = exchangeArg;
        _orderBook = orderBookArg;
        _accountBalance = accountBalanceArg;
        _marketRegistry = marketRegistryArg;
        _insuranceFund = insuranceFundArg;
        _platformFund = platformFundArg;
        _maker = makerArg;

        _settlementTokenDecimals = IVault(_vault).decimals();
    }

    /// @dev remove to reduce bytecode size, might add back when we need it
    // // solhint-disable-next-line func-order
    // function setTrustedForwarder(address trustedForwarderArg) external onlyOwner {
    //     // CH_TFNC: TrustedForwarder is not contract
    //     require(trustedForwarderArg.isContract(), "CH_TFNC");
    //     // TrustedForwarderUpdated event is emitted in BaseRelayRecipient
    //     _setTrustedForwarder(trustedForwarderArg);
    // }

    function setDelegateApproval(address delegateApprovalArg) external onlyOwner {
        // CH_DANC: DelegateApproval is not contract
        require(delegateApprovalArg.isContract(), "CH_DANC");
        _delegateApproval = delegateApprovalArg;
        emit DelegateApprovalChanged(delegateApprovalArg);
    }

    function setPlatformFund(address platformFundArg) external onlyOwner {
        _platformFund = platformFundArg;
        emit PlatformFundChanged(platformFundArg);
    }

    /// @inheritdoc IClearingHouse
    function addLiquidity(
        DataTypes.AddLiquidityParams memory params
    )
        public
        override
        whenNotPaused
        nonReentrant
        checkDeadline(params.deadline)
        onlyMaker
        returns (
            // check onlyLiquidityAdmin
            DataTypes.AddLiquidityResponse memory
        )
    {
        return LiquidityLogic.addLiquidity(address(this), params);
    }

    /// @inheritdoc IClearingHouse
    function removeLiquidity(
        DataTypes.RemoveLiquidityParams memory params
    )
        public
        override
        whenNotPaused
        nonReentrant
        checkDeadline(params.deadline)
        onlyMaker
        returns (DataTypes.RemoveLiquidityResponse memory)
    {
        return LiquidityLogic.removeLiquidity(address(this), params);
    }

    /// @inheritdoc IClearingHouse
    function settleAllFunding(address trader) external override {
        // only vault or trader
        // vault must check msg.sender == trader when calling settleAllFunding
        require(_msgSender() == _vault || _msgSender() == trader, "CH_OVOT");

        address[] memory baseTokens = IAccountBalance(_accountBalance).getBaseTokens(trader);
        uint256 baseTokenLength = baseTokens.length;
        for (uint256 i = 0; i < baseTokenLength; i++) {
            _settleFunding(trader, baseTokens[i]);
        }
    }

    /// @inheritdoc IClearingHouse
    function openPosition(
        DataTypes.OpenPositionParams memory params
    )
        external
        override
        whenNotPaused
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 base, uint256 quote)
    {
        // openPosition() is already published, returned types remain the same (without fee)
        (base, quote, ) = _openPositionFor(_msgSender(), params);
        return (base, quote);
    }

    /// @inheritdoc IClearingHouse
    function openPositionFor(
        address trader,
        DataTypes.OpenPositionParams memory params
    )
        external
        override
        whenNotPaused
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 base, uint256 quote, uint256 fee)
    {
        // CH_SHNAOPT: Sender Has No Approval to Open Position for Trader
        require(IDelegateApproval(_delegateApproval).canOpenPositionFor(trader, _msgSender()), "CH_SHNAOPT");

        return _openPositionFor(trader, params);
    }

    /// @inheritdoc IClearingHouse
    function closePosition(
        DataTypes.ClosePositionParams memory params
    ) public override whenNotPaused nonReentrant checkDeadline(params.deadline) returns (uint256 base, uint256 quote) {
        return ExchangeLogic.closePosition(address(this), _msgSender(), params);
    }

    /// @inheritdoc IClearingHouse
    function liquidate(address trader, address baseToken) external override whenNotPaused nonReentrant {
        // positionSizeToBeLiquidated = 0 means liquidating as much as possible
        _liquidate(trader, baseToken);
    }

    // /// @inheritdoc IClearingHouse
    // function cancelExcessOrders(address baseToken) external override onlyMaker whenNotPaused nonReentrant {
    //     // input requirement checks:
    //     //   maker: in _cancelExcessOrders()
    //     //   baseToken: in Exchange.settleFunding()
    //     //   orderIds: in OrderBook.removeLiquidityByIds()

    //     _cancelExcessOrders(baseToken);
    // }

    // /// @inheritdoc IClearingHouse
    // function cancelAllExcessOrders(address baseToken) external override onlyMaker whenNotPaused nonReentrant {
    //     // input requirement checks:
    //     //   maker: in _cancelExcessOrders()
    //     //   baseToken: in Exchange.settleFunding()
    //     //   orderIds: in OrderBook.removeLiquidityByIds()

    //     _cancelExcessOrders(baseToken);
    // }

    /// @inheritdoc IClearingHouse
    function quitMarket(address trader, address baseToken) external override returns (uint256 base, uint256 quote) {
        // CH_MNC: Market not closed
        require(IBaseToken(baseToken).isClosed(), "CH_MNC");

        _settleFunding(trader, baseToken);

        int256 positionSize = _getTakerPosition(trader, baseToken);

        // if position is 0, no need to do settlement accounting
        if (positionSize == 0) {
            return (0, 0);
        }

        (int256 positionNotional, int256 openNotional, int256 realizedPnl, uint256 closedPrice) = IAccountBalance(
            _accountBalance
        ).settlePositionInClosedMarket(trader, baseToken);

        emit PositionClosed(trader, baseToken, positionSize, positionNotional, openNotional, realizedPnl, closedPrice);

        _settleBadDebt(trader);

        return (positionSize.abs(), positionNotional.abs());
    }

    /// @inheritdoc IUniswapV3MintCallback
    /// @dev namings here follow Uniswap's convention
    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data) external override {
        // input requirement checks:
        //   amount0Owed: here
        //   amount1Owed: here
        //   data: X

        // For caller validation purposes it would be more efficient and more reliable to use
        // "msg.sender" instead of "_msgSender()" as contracts never call each other through GSN.
        // not orderbook
        require(msg.sender == _orderBook, "CH_NOB");

        IOrderBook.MintCallbackData memory callbackData = abi.decode(data, (IOrderBook.MintCallbackData));

        if (amount0Owed > 0) {
            address token = IUniswapV3Pool(callbackData.pool).token0();
            _requireTransfer(token, callbackData.pool, amount0Owed);
        }
        if (amount1Owed > 0) {
            address token = IUniswapV3Pool(callbackData.pool).token1();
            _requireTransfer(token, callbackData.pool, amount1Owed);
        }
    }

    /// @inheritdoc IUniswapV3SwapCallback
    /// @dev namings here follow Uniswap's convention
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external override {
        // input requirement checks:
        //   amount0Delta: here
        //   amount1Delta: here
        //   data: X
        // For caller validation purposes it would be more efficient and more reliable to use
        // "msg.sender" instead of "_msgSender()" as contracts never call each other through GSN.
        require(msg.sender == _exchange, "CH_OE");

        // swaps entirely within 0-liquidity regions are not supported -> 0 swap is forbidden
        // CH_F0S: forbidden 0 swap
        require((amount0Delta > 0 && amount1Delta < 0) || (amount0Delta < 0 && amount1Delta > 0), "CH_F0S");

        IExchange.SwapCallbackData memory callbackData = abi.decode(data, (IExchange.SwapCallbackData));
        IUniswapV3Pool uniswapV3Pool = IUniswapV3Pool(callbackData.pool);

        // amount0Delta & amount1Delta are guaranteed to be positive when being the amount to be paid
        (address token, uint256 amountToPay) = amount0Delta > 0
            ? (uniswapV3Pool.token0(), uint256(amount0Delta))
            : (uniswapV3Pool.token1(), uint256(amount1Delta));

        // swap
        _requireTransfer(token, callbackData.pool, amountToPay);
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IClearingHouse
    function getQuoteToken() external view override returns (address) {
        return _quoteToken;
    }

    /// @inheritdoc IClearingHouse
    function getUniswapV3Factory() external view override returns (address) {
        return _uniswapV3Factory;
    }

    /// @inheritdoc IClearingHouse
    function getClearingHouseConfig() external view override returns (address) {
        return _clearingHouseConfig;
    }

    /// @inheritdoc IClearingHouse
    function getVault() external view override returns (address) {
        return _vault;
    }

    /// @inheritdoc IClearingHouse
    function getExchange() external view override returns (address) {
        return _exchange;
    }

    /// @inheritdoc IClearingHouse
    function getOrderBook() external view override returns (address) {
        return _orderBook;
    }

    /// @inheritdoc IClearingHouse
    function getAccountBalance() external view override returns (address) {
        return _accountBalance;
    }

    /// @inheritdoc IClearingHouse
    function getInsuranceFund() external view override returns (address) {
        return _insuranceFund;
    }

    /// @inheritdoc IClearingHouse
    function getPlatformFund() external view override returns (address) {
        return _platformFund;
    }

    /// @inheritdoc IClearingHouse
    function getDelegateApproval() external view override returns (address) {
        return _delegateApproval;
    }

    function getMaker() external view override returns (address) {
        return _maker;
    }

    /// @inheritdoc IClearingHouse
    function getAccountValue(address trader) public view override returns (int256) {
        return IVault(_vault).getAccountValue(trader).parseSettlementToken(_settlementTokenDecimals);
    }

    //
    // INTERNAL NON-VIEW
    //

    function _requireTransfer(address token, address to, uint256 amount) internal {
        // CH_TF: Transfer failed
        require(IERC20Metadata(token).transfer(to, amount), "CH_TF");
    }

    function _liquidate(address trader, address baseToken) internal {
        return ExchangeLogic.liquidate(address(this), _msgSender(), trader, baseToken);
    }

    // /// @dev only cancel open orders if there are not enough free collateral with mmRatio
    // /// or account is able to being liquidated.
    // function _cancelExcessOrders(address baseToken) internal {
    //     _checkMarketOpen(baseToken);

    //     // remove all orders in internal function
    //     LiquidityLogic.removeAllLiquidity(address(this), baseToken);
    // }

    function _openPositionFor(
        address trader,
        DataTypes.OpenPositionParams memory params
    ) internal returns (uint256 base, uint256 quote, uint256 fee) {
        return ExchangeLogic.openPositionFor(address(this), trader, params);
    }

    /// @dev Settle trader's funding payment to his/her realized pnl.
    function _settleFunding(
        address trader,
        address baseToken
    ) internal returns (DataTypes.Growth memory fundingGrowthGlobal) {
        int256 fundingPayment;
        (fundingPayment, fundingGrowthGlobal) = IExchange(_exchange).settleFunding(trader, baseToken);

        if (fundingPayment != 0) {
            _modifyOwedRealizedPnl(trader, fundingPayment.neg256());
            emit FundingPaymentSettled(trader, baseToken, fundingPayment);
        }

        IAccountBalance(_accountBalance).updateTwPremiumGrowthGlobal(
            trader,
            baseToken,
            fundingGrowthGlobal.twLongPremiumX96,
            fundingGrowthGlobal.twShortPremiumX96
        );
        return fundingGrowthGlobal;
    }

    // function _registerBaseToken(address trader, address baseToken) internal {
    //     IAccountBalance(_accountBalance).registerBaseToken(trader, baseToken);
    // }

    function _modifyOwedRealizedPnl(address trader, int256 amount) internal {
        IAccountBalance(_accountBalance).modifyOwedRealizedPnl(trader, amount);
    }

    // function _emitPositionChanged(
    //     address trader,
    //     address baseToken,
    //     int256 exchangedPositionSize,
    //     int256 exchangedPositionNotional,
    //     uint256 fee,
    //     int256 openNotional,
    //     int256 realizedPnl,
    //     uint256 sqrtPriceAfterX96
    // ) internal {
    //     emit PositionChanged(
    //         trader,
    //         baseToken,
    //         exchangedPositionSize,
    //         exchangedPositionNotional,
    //         fee,
    //         openNotional,
    //         realizedPnl,
    //         sqrtPriceAfterX96
    //     );
    // }

    // function _emitLiquidityChanged(
    //     address maker,
    //     address baseToken,
    //     address quoteToken,
    //     int24 lowerTick,
    //     int24 upperTick,
    //     int256 base,
    //     int256 quote,
    //     int128 liquidity,
    //     uint256 quoteFee
    // ) internal {
    //     emit LiquidityChanged(maker, baseToken, quoteToken, lowerTick, upperTick, base, quote, liquidity, quoteFee);
    // }

    // function _referredPositionChanged(bytes32 referralCode) internal {
    //     if (referralCode != 0) {
    //         emit ReferredPositionChanged(referralCode);
    //     }
    // }

    function _settleBadDebt(address trader) internal {
        IVault(_vault).settleBadDebt(trader);
    }

    //
    // INTERNAL VIEW
    //

    /// @inheritdoc BaseRelayRecipient
    function _msgSender() internal view override(BaseRelayRecipient, OwnerPausable) returns (address payable) {
        return super._msgSender();
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgData() internal view override(BaseRelayRecipient, OwnerPausable) returns (bytes memory) {
        return super._msgData();
    }

    function _getTakerOpenNotional(address trader, address baseToken) internal view returns (int256) {
        return IAccountBalance(_accountBalance).getTakerOpenNotional(trader, baseToken);
    }

    function _getTakerPositionSafe(address trader, address baseToken) internal view returns (int256) {
        int256 takerPositionSize = _getTakerPosition(trader, baseToken);
        // CH_PSZ: position size is zero
        require(takerPositionSize != 0, "CH_PSZ");
        return takerPositionSize;
    }

    function _getTakerPosition(address trader, address baseToken) internal view returns (int256) {
        return IAccountBalance(_accountBalance).getTakerPositionSize(trader, baseToken);
    }

    function _getFreeCollateralByRatio(address trader, uint24 ratio) internal view returns (int256) {
        return IVault(_vault).getFreeCollateralByRatio(trader, ratio);
    }

    function _getSqrtMarkX96(address baseToken) internal view returns (uint160) {
        return IExchange(_exchange).getSqrtMarkTwapX96(baseToken, 0);
    }

    function _getMarginRequirementForLiquidation(address trader) internal view returns (int256) {
        return IAccountBalance(_accountBalance).getMarginRequirementForLiquidation(trader);
    }

    function _getLiquidationPenaltyRatio() internal view returns (uint24) {
        return IClearingHouseConfig(_clearingHouseConfig).getLiquidationPenaltyRatio();
    }

    function _getTotalAbsPositionValue(address trader) internal view returns (uint256) {
        return IAccountBalance(_accountBalance).getTotalAbsPositionValue(trader);
    }

    /// @dev liquidation condition:
    ///      accountValue < sum(abs(positionValue_by_market)) * mmRatio = totalMinimumMarginRequirement
    function _isLiquidatable(address trader) internal view returns (bool) {
        return getAccountValue(trader) < _getMarginRequirementForLiquidation(trader);
    }

    // function _settleBalanceAndDeregister(
    //     address trader,
    //     address baseToken,
    //     int256 takerBase,
    //     int256 takerQuote,
    //     int256 realizedPnl,
    //     int256 makerFee
    // ) internal {
    //     IAccountBalance(_accountBalance).settleBalanceAndDeregister(
    //         trader,
    //         baseToken,
    //         takerBase,
    //         takerQuote,
    //         realizedPnl,
    //         makerFee
    //     );
    // }

    function _checkMarketOpen(address baseToken) internal view {
        // CH_MNO: Market not opened
        require(IBaseToken(baseToken).isOpen(), "CH_MNO");
    }

    function _isContract(address contractArg, string memory errorMsg) internal view {
        require(contractArg.isContract(), errorMsg);
    }

    function isAbleRepeg(address baseToken) public view returns (bool) {
        (uint256 longPositionSize, uint256 shortPositionSize) = IAccountBalance(
            IClearingHouse(_marketRegistry).getAccountBalance()
        ).getMarketPositionSize(baseToken);
        if (longPositionSize + shortPositionSize == 0) {
            return true;
        }
        if (!IExchange(_exchange).isOverPriceSpread(baseToken)) {
            return false;
        }
        // if (!IExchange(_exchange).isOverPriceSpreadTimestamp(baseToken)) {
        //     return false;
        // }
        return true;
    }

    struct InternalRepegParams {
        uint160 oldSqrtMarkPrice;
        uint256 oldMarkPrice;
        uint160 newSqrtMarkPrice;
        uint256 newMarkPrice;
        uint256 spotPrice;
        uint160 sqrtSpotPrice;
        int256 oldDeltaBase;
        uint256 newDeltaBase;
        uint256 oldLongPositionSize;
        uint256 oldShortPositionSize;
        uint256 deltaQuote;
    }

    ///REPEG
    function repeg(address baseToken) external {
        // check isAbleRepeg
        // CH_NRP: not repeg
        // require(isAbleRepeg(baseToken), "CH_NRP");
        //settleFundingGlobal
        GenericLogic.settleFundingGlobal(address(this), baseToken);
        //variable
        InternalRepegParams memory repegParams;
        (repegParams.oldSqrtMarkPrice, , , , , , ) = UniswapV3Broker.getSlot0(
            IMarketRegistry(_marketRegistry).getPool(baseToken)
        );
        repegParams.oldMarkPrice = repegParams.oldSqrtMarkPrice.formatSqrtPriceX96ToPriceX96().formatX96ToX10_18();
        repegParams.spotPrice = IIndexPrice(baseToken).getIndexPrice(
            IClearingHouseConfig(_clearingHouseConfig).getTwapInterval()
        );
        repegParams.sqrtSpotPrice = repegParams.spotPrice.formatPriceX10_18ToSqrtPriceX96();

        if (repegParams.spotPrice != repegParams.oldMarkPrice) {
            // check mark price != index price over 10% and over 1 hour
            // calculate delta base (11) of long short -> delta quote (1)
            // for multiplier
            (
                repegParams.oldLongPositionSize,
                repegParams.oldShortPositionSize,
                repegParams.oldDeltaBase,
                repegParams.deltaQuote
            ) = GenericLogic.getInfoMultiplier(address(this), baseToken);
            // for multiplier

            // calculate base amount for openPosition -> spot price
            // maker openPosition -> spot price
            bool isRepegUp = repegParams.spotPrice > repegParams.oldMarkPrice;
            //internal swap
            IExchange(_exchange).internalSwap(
                IExchange.SwapParams({
                    trader: msg.sender,
                    baseToken: baseToken,
                    isBaseToQuote: !isRepegUp,
                    isExactInput: true,
                    isClose: false,
                    amount: type(uint256).max.div(1e10),
                    sqrtPriceLimitX96: repegParams.sqrtSpotPrice
                })
            );
            // calculate delta quote (1) -> new delta base (22)
            // calculate scale -> new mark price => rate = (% delta price)
            // calculate scale for long short = (diff delta base on (11 - 22)) / (total_long + total_short)
            // if delta base < 0 -> decrase delta long short
            // -> if long > short -> decrease long and increase short
            // -> if long < short -> increase long and decrease short
            // if delta base > 0 -> increase delta long short
            // -> if long > short -> increase long and decrease short
            // -> if long < short -> decrease long and increase short
            // update scale for position size for long short
            (repegParams.newSqrtMarkPrice, , , , , , ) = UniswapV3Broker.getSlot0(
                IMarketRegistry(_marketRegistry).getPool(baseToken)
            );
            repegParams.newMarkPrice = repegParams.newSqrtMarkPrice.formatSqrtPriceX96ToPriceX96().formatX96ToX10_18();
            // for multiplier
            GenericLogic.updateInfoMultiplier(
                address(this),
                baseToken,
                repegParams.oldLongPositionSize,
                repegParams.oldShortPositionSize,
                repegParams.oldDeltaBase,
                repegParams.oldMarkPrice,
                repegParams.newMarkPrice,
                repegParams.deltaQuote
            );
            // for multiplier
            IExchange(_exchange).updateOverPriceSpreadTimestamp(baseToken);
            // emit event
            emit Repeg(repegParams.oldMarkPrice, repegParams.newMarkPrice);
        }
    }
}

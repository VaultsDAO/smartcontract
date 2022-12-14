// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

// Prettier ignore to prevent buidler flatter bug
// prettier-ignore

import "../openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IConfigProvider} from "../interfaces/IConfigProvider.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {IShop} from "../interfaces/IShop.sol";
import {IShopLoan} from "../interfaces/IShopLoan.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {ShopFactoryStorage} from "./ShopFactoryStorage.sol";
import {ERC721HolderUpgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import {IERC721Upgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {ERC20} from "../openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ShopConfiguration} from "../libraries/configuration/ShopConfiguration.sol";
import {BorrowLogic} from "../libraries/logic/BorrowLogic.sol";
import {LiquidateLogic} from "../libraries/logic/LiquidateLogic.sol";
import {GenericLogic} from "../libraries/logic/GenericLogic.sol";
import {Constants} from "../libraries/configuration/Constants.sol";
import {TransferHelper} from "../libraries/helpers/TransferHelper.sol";
import {IReserveOracleGetter} from "../interfaces/IReserveOracleGetter.sol";

contract ShopFactory is
    IShop,
    ShopFactoryStorage,
    ContextUpgradeable,
    ERC721HolderUpgradeable
{
    IConfigProvider public provider;

    using ShopConfiguration for DataTypes.ShopConfiguration;

    // ======== Constructor =========
    constructor() {}

    receive() external payable {}

    function initialize(IConfigProvider _provider) external initializer {
        __Context_init();
        __ERC721Holder_init();
        // provider
        provider = _provider;
    }

    // CONFIG FUNCTIONS

    // SHOP FUNCTIONS

    function create() external returns (uint256) {
        return _create(_msgSender());
    }

    function _create(address creator) internal returns (uint256) {
        require(creators[creator] == 0, "msg sender is created");
        shopCount++;
        //
        uint256 shopId = shopCount;

        DataTypes.ShopData memory shop = DataTypes.ShopData({
            id: shopCount,
            creator: creator
        });
        shops[shopId] = shop;
        creators[creator] = shopId;

        emit Created(creator, shopId);

        return shopId;
    }

    function shopOf(address creator) public view returns (uint256) {
        return creators[creator];
    }

    modifier nonReentrant() {
        // On the first call to nonReentrant, _notEntered will be true
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    modifier whenNotPaused() {
        _whenNotPaused();
        _;
    }

    modifier onlyFactoryConfigurator() {
        _onlyFactoryConfigurator();
        _;
    }

    function _whenNotPaused() internal view {
        require(!_paused, Errors.LP_IS_PAUSED);
    }

    function _onlyFactoryConfigurator() internal view {
        require(
            IConfigProvider(provider).owner() == _msgSender(),
            Errors.LP_CALLER_NOT_LEND_POOL_CONFIGURATOR
        );
    }

    function getReservesInfo(
        address reserveAsset
    ) external view returns (DataTypes.ReservesInfo memory) {
        return reservesInfo[reserveAsset];
    }

    /**
     * @dev Allows users to borrow a specific `amount` of the reserve underlying asset
     * - E.g. User borrows 100 USDC, receiving the 100 USDC in his wallet
     *   and lock collateral asset in contract
     * @param asset The address of the underlying asset to borrow
     * @param amount The amount to be borrowed
     * @param nftAsset The address of the underlying nft used as collateral
     * @param nftTokenId The token ID of the underlying nft used as collateral
     **/
    function borrow(
        uint256 shopId,
        address asset,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address onBehalfOf
    ) external override nonReentrant whenNotPaused {
        _borrow(shopId, asset, amount, nftAsset, nftTokenId, onBehalfOf, false);
    }

    function borrowETH(
        uint256 shopId,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address onBehalfOf
    ) external override nonReentrant whenNotPaused {
        _borrow(
            shopId,
            GenericLogic.getWETHAddress(IConfigProvider(provider)),
            amount,
            nftAsset,
            nftTokenId,
            onBehalfOf,
            true
        );
    }

    function _borrow(
        uint256 shopId,
        address asset,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address onBehalfOf,
        bool isNative
    ) internal {
        DataTypes.ShopConfiguration storage shopConfig = shopsConfig[shopId][
            asset
        ][nftAsset];
        require(shopConfig.getActive(), Errors.RC_NOT_ACTIVE);
        BorrowLogic.executeBorrow(
            shops[shopId],
            shopConfig,
            IConfigProvider(provider),
            reservesInfo,
            nftsInfo,
            DataTypes.ExecuteBorrowParams({
                initiator: _msgSender(),
                asset: asset,
                amount: amount,
                nftAsset: nftAsset,
                nftTokenId: nftTokenId,
                onBehalfOf: onBehalfOf,
                isNative: isNative
            })
        );
    }

    function batchBorrow(
        uint256 shopId,
        address[] calldata assets,
        uint256[] calldata amounts,
        address[] calldata nftAssets,
        uint256[] calldata nftTokenIds,
        address onBehalfOf
    ) external override nonReentrant whenNotPaused {
        DataTypes.ExecuteBatchBorrowParams memory params;
        params.initiator = _msgSender();
        params.assets = assets;
        params.amounts = amounts;
        params.nftAssets = nftAssets;
        params.nftTokenIds = nftTokenIds;
        params.onBehalfOf = onBehalfOf;
        params.isNative = false;

        BorrowLogic.executeBatchBorrow(
            shops[shopId],
            shopsConfig,
            IConfigProvider(provider),
            reservesInfo,
            nftsInfo,
            params
        );
    }

    function batchBorrowETH(
        uint256 shopId,
        uint256[] calldata amounts,
        address[] calldata nftAssets,
        uint256[] calldata nftTokenIds,
        address onBehalfOf
    ) external override nonReentrant whenNotPaused {
        for (uint256 i = 0; i < nftAssets.length; i++) {
            _borrow(
                shopId,
                GenericLogic.getWETHAddress(IConfigProvider(provider)),
                amounts[i],
                nftAssets[i],
                nftTokenIds[i],
                onBehalfOf,
                true
            );
        }
    }

    /**
     * @notice Repays a borrowed `amount` on a specific reserve, burning the equivalent loan owned
     * - E.g. User repays 100 USDC, burning loan and receives collateral asset
     * @param amount The amount to repay
     **/
    function repay(
        uint256 loanId,
        uint256 amount
    )
        external
        override
        nonReentrant
        whenNotPaused
        returns (uint256, uint256, bool)
    {
        return _repay(loanId, amount, false);
    }

    function repayETH(
        uint256 loanId,
        uint256 amount
    )
        external
        payable
        override
        nonReentrant
        whenNotPaused
        returns (uint256, uint256, bool)
    {
        require(amount == msg.value, Errors.LP_INVALID_ETH_AMOUNT);
        //convert eth -> weth
        TransferHelper.convertETHToWETH(
            GenericLogic.getWETHAddress(IConfigProvider(provider)),
            msg.value
        );
        return _repay(loanId, amount, true);
    }

    function _repay(
        uint256 loanId,
        uint256 amount,
        bool isNative
    ) internal returns (uint256, uint256, bool) {
        DataTypes.LoanData memory loanData = IShopLoan(
            IConfigProvider(provider).loanManager()
        ).getLoan(loanId);
        DataTypes.ShopData storage shop = shops[loanData.shopId];
        return
            BorrowLogic.executeRepay(
                IConfigProvider(provider),
                reservesInfo,
                DataTypes.ExecuteRepayParams({
                    initiator: _msgSender(),
                    loanId: loanId,
                    amount: amount,
                    shopCreator: shop.creator,
                    isNative: isNative
                })
            );
    }

    function batchRepay(
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    )
        external
        override
        nonReentrant
        whenNotPaused
        returns (uint256[] memory, uint256[] memory, bool[] memory)
    {
        return _batchRepay(loanIds, amounts, false);
    }

    function batchRepayETH(
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    )
        external
        payable
        override
        nonReentrant
        whenNotPaused
        returns (uint256[] memory, uint256[] memory, bool[] memory)
    {
        uint256 val = 0;
        for (uint256 i = 0; i < loanIds.length; i++) {
            val += amounts[i];
        }
        require(msg.value >= val, Errors.LP_INVALID_ETH_AMOUNT);

        uint256 dustAmount = msg.value - val;
        //convert eth -> weth
        TransferHelper.convertETHToWETH(
            GenericLogic.getWETHAddress(IConfigProvider(provider)),
            val
        );
        if (dustAmount >= IConfigProvider(provider).minDustAmount()) {
            //transfer back eth to user
            TransferHelper.safeTransferETH(
                GenericLogic.getWETHAddress(IConfigProvider(provider)),
                msg.sender,
                dustAmount
            );
        }

        return _batchRepay(loanIds, amounts, true);
    }

    function _batchRepay(
        uint256[] calldata loanIds,
        uint256[] calldata amounts,
        bool isNative
    ) internal returns (uint256[] memory, uint256[] memory, bool[] memory) {
        uint256[] memory repayAmounts = new uint256[](loanIds.length);
        uint256[] memory feeAmounts = new uint256[](loanIds.length);
        bool[] memory repayAlls = new bool[](loanIds.length);

        for (uint256 i = 0; i < loanIds.length; i++) {
            (repayAmounts[i], feeAmounts[i], repayAlls[i]) = _repay(
                loanIds[i],
                amounts[i],
                isNative
            );
        }

        return (repayAmounts, feeAmounts, repayAlls);
    }

    /**
     * @dev Function to auction a non-healthy position collateral-wise
     * - The bidder want to buy collateral asset of the user getting liquidated
     **/
    function auction(
        uint256 loanId,
        uint256 bidPrice,
        address onBehalfOf
    ) external override nonReentrant whenNotPaused {
        _auction(loanId, bidPrice, onBehalfOf, false);
    }

    function auctionETH(
        uint256 loanId,
        address onBehalfOf
    ) external payable override nonReentrant whenNotPaused {
        uint256 bidPrice = msg.value;
        //convert eth -> weth
        TransferHelper.convertETHToWETH(
            GenericLogic.getWETHAddress(IConfigProvider(provider)),
            bidPrice
        );
        _auction(loanId, bidPrice, onBehalfOf, true);
    }

    function _auction(
        uint256 loanId,
        uint256 bidPrice,
        address onBehalfOf,
        bool isNative
    ) internal {
        LiquidateLogic.executeAuction(
            provider,
            reservesInfo,
            nftsInfo,
            DataTypes.ExecuteAuctionParams({
                initiator: _msgSender(),
                loanId: loanId,
                bidPrice: bidPrice,
                onBehalfOf: onBehalfOf,
                isNative: isNative
            })
        );
    }

    /**
     * @notice Redeem a NFT loan which state is in Auction
     * - E.g. User repays 100 USDC, burning loan and receives collateral asset
     * @param amount The amount to repay the debt
     * @param bidFine The amount of bid fine
     **/
    function redeem(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine
    )
        external
        override
        nonReentrant
        whenNotPaused
        returns (
            uint256 remainAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        )
    {
        return _redeem(loanId, amount, bidFine, false);
    }

    function redeemETH(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine
    )
        external
        payable
        override
        nonReentrant
        whenNotPaused
        returns (
            uint256 remainAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        )
    {
        require(msg.value >= amount + bidFine, Errors.LP_INVALID_ETH_AMOUNT);

        uint256 dustAmount = msg.value - (amount + bidFine);
        //convert eth -> weth
        TransferHelper.convertETHToWETH(
            GenericLogic.getWETHAddress(IConfigProvider(provider)),
            amount + bidFine
        );
        if (dustAmount >= IConfigProvider(provider).minDustAmount()) {
            //transfer back eth to user
            TransferHelper.safeTransferETH(
                GenericLogic.getWETHAddress(IConfigProvider(provider)),
                msg.sender,
                dustAmount
            );
        }

        return _redeem(loanId, amount, bidFine, true);
    }

    function _redeem(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine,
        bool isNative
    )
        internal
        returns (
            uint256 remainAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        )
    {
        DataTypes.LoanData memory loanData = IShopLoan(
            IConfigProvider(provider).loanManager()
        ).getLoan(loanId);
        return
            LiquidateLogic.executeRedeem(
                provider,
                reservesInfo,
                nftsInfo,
                DataTypes.ExecuteRedeemParams({
                    initiator: _msgSender(),
                    loanId: loanId,
                    amount: amount,
                    bidFine: bidFine,
                    shopCreator: shops[loanData.shopId].creator,
                    isNative: isNative
                })
            );
    }

    /**
     * @dev Function to liquidate a non-healthy position collateral-wise
     * - The caller (liquidator) buy collateral asset of the user getting liquidated, and receives
     *   the collateral asset
     **/
    function liquidate(
        uint256 loanId
    ) external override nonReentrant whenNotPaused {
        DataTypes.LoanData memory loanData = IShopLoan(provider.loanManager())
            .getLoan(loanId);
        DataTypes.ShopData memory shop = shops[loanData.shopId];
        return
            LiquidateLogic.executeLiquidate(
                provider,
                reservesInfo,
                nftsInfo,
                DataTypes.ExecuteLiquidateParams({
                    initiator: _msgSender(),
                    loanId: loanId,
                    shopCreator: shop.creator
                })
            );
    }

    /**
     * @dev Returns the list of the initialized reserves
     **/
    function getReservesList()
        external
        view
        override
        returns (address[] memory)
    {
        return reserves;
    }

    /**
     * @dev Returns the list of the initialized nfts
     **/
    function getNftsList() external view override returns (address[] memory) {
        return nfts;
    }

    /**
     * @dev Set the _pause state of the pool
     * - Only callable by the LendPoolConfigurator contract
     * @param val `true` to pause the pool, `false` to un-pause it
     */
    function setPause(bool val) external override onlyFactoryConfigurator {
        if (_paused != val) {
            _paused = val;
            emit Paused();
        }
    }

    /**
     * @dev Returns if the LendPool is paused
     */
    function paused() external view override returns (bool) {
        return _paused;
    }

    /**
     * @dev Returns the cached LendPoolConfigProvider connected to this contract
     **/
    function getConfigProvider()
        external
        view
        override
        returns (IConfigProvider)
    {
        return IConfigProvider(provider);
    }

    function getShop(
        uint256 shopId
    ) external view returns (DataTypes.ShopData memory) {
        return shops[shopId];
    }

    function addReserve(
        address asset
    ) external override onlyFactoryConfigurator {
        require(AddressUpgradeable.isContract(asset), Errors.LP_NOT_CONTRACT);
        _addReserveToList(asset);
    }

    function _addReserveToList(address asset) internal {
        require(
            reservesInfo[asset].id == 0,
            Errors.RL_RESERVE_ALREADY_INITIALIZED
        );
        reservesInfo[asset] = DataTypes.ReservesInfo({
            id: uint8(reserves.length) + 1,
            contractAddress: asset,
            active: true,
            symbol: ERC20(asset).symbol(),
            decimals: ERC20(asset).decimals()
        });
        reserves.push(asset);
    }

    function addNftCollection(
        address nftAddress,
        string memory collection,
        uint256 maxSupply
    ) external override onlyFactoryConfigurator {
        require(
            AddressUpgradeable.isContract(nftAddress),
            Errors.LP_NOT_CONTRACT
        );
        _addNftToList(nftAddress, collection, maxSupply);
        IERC721Upgradeable(nftAddress).setApprovalForAll(
            provider.loanManager(),
            true
        );
        IShopLoan(provider.loanManager()).initNft(nftAddress);
    }

    function _addNftToList(
        address nftAddress,
        string memory collection,
        uint256 maxSupply
    ) internal {
        require(
            nftsInfo[nftAddress].id == 0,
            Errors.LP_NFT_ALREADY_INITIALIZED
        );
        nftsInfo[nftAddress] = DataTypes.NftsInfo({
            id: uint8(nfts.length) + 1,
            contractAddress: nftAddress,
            active: true,
            collection: collection,
            maxSupply: maxSupply
        });
        nfts.push(nftAddress);
    }

    function setShopConfigurations(
        DataTypes.ShopConfigParams[] memory params
    ) external {
        uint256 shopId = shopOf(_msgSender());
        if (shopId == 0) {
            shopId = _create(_msgSender());
        }
        // reserve => map(nft => config)
        mapping(address => mapping(address => DataTypes.ShopConfiguration))
            storage shopConfig = shopsConfig[shopId];

        for (uint256 i = 0; i < params.length; ++i) {
            mapping(address => DataTypes.ShopConfiguration)
                storage reserveConfig = shopConfig[params[i].reserveAddress];
            DataTypes.ShopConfiguration memory nftConfig = DataTypes
                .ShopConfiguration({data: 0});
            nftConfig.setActive(params[i].active);
            nftConfig.setLtv(params[i].ltvRate);
            nftConfig.setInterestRate(params[i].interestRate);
            reserveConfig[params[i].nftAddress] = nftConfig;
            emit ConfigurationUpdated(
                shopId,
                params[i].reserveAddress,
                params[i].nftAddress,
                params[i].interestRate,
                params[i].ltvRate,
                params[i].active
            );
        }
    }

    function rebuy(
        uint256 loanId,
        uint256 rebuyAmount,
        uint256 payAmount
    )
        external
        override
        nonReentrant
        whenNotPaused
        returns (uint256 paymentAmount, uint256 dustAmount)
    {
        (paymentAmount, dustAmount) = _rebuy(
            loanId,
            rebuyAmount,
            payAmount,
            false
        );
    }

    function rebuyETH(
        uint256 loanId,
        uint256 rebuyAmount
    )
        external
        payable
        override
        nonReentrant
        whenNotPaused
        returns (uint256 paymentAmount, uint256 dustAmount)
    {
        //convert eth -> weth
        TransferHelper.convertETHToWETH(
            GenericLogic.getWETHAddress(IConfigProvider(provider)),
            msg.value
        );
        (paymentAmount, dustAmount) = _rebuy(
            loanId,
            rebuyAmount,
            msg.value,
            true
        );
        if (dustAmount >= IConfigProvider(provider).minDustAmount()) {
            //transfer back eth to user
            TransferHelper.transferWETH2ETH(
                GenericLogic.getWETHAddress(IConfigProvider(provider)),
                msg.sender,
                dustAmount
            );
        }
    }

    function _rebuy(
        uint256 loanId,
        uint256 rebuyAmount,
        uint256 payAmount,
        bool isNative
    ) internal returns (uint256, uint256) {
        DataTypes.LoanData memory loanData = IShopLoan(
            IConfigProvider(provider).loanManager()
        ).getLoan(loanId);
        return
            LiquidateLogic.executeRebuy(
                provider,
                reservesInfo,
                nftsInfo,
                DataTypes.ExecuteRebuyParams({
                    initiator: msg.sender,
                    loanId: loanId,
                    rebuyAmount: rebuyAmount,
                    payAmount: payAmount,
                    shopCreator: shops[loanData.shopId].creator,
                    isNative: isNative
                })
            );
    }
}

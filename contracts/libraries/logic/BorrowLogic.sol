// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {IConfigProvider} from "../../interfaces/IConfigProvider.sol";

import {IShopLoan} from "../../interfaces/IShopLoan.sol";

import {PercentageMath} from "../math/PercentageMath.sol";

import {Errors} from "../helpers/Errors.sol";
import {TransferHelper} from "../helpers/TransferHelper.sol";
import {DataTypes} from "../types/DataTypes.sol";

import {IERC20Upgradeable} from "../../openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "../../openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import {IERC721Upgradeable} from "../../openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../../openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721EnumerableUpgradeable.sol";

// import {ReserveLogic} from "./ReserveLogic.sol";
import {GenericLogic} from "./GenericLogic.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {ShopConfiguration} from "../configuration/ShopConfiguration.sol";

/**
 * @title BorrowLogic library
 * @notice Implements the logic to borrow feature
 */
library BorrowLogic {
    using PercentageMath for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ShopConfiguration for DataTypes.ShopConfiguration;
    /**
     * @dev Emitted on borrow() when loan needs to be opened
     * @param user The address of the user initiating the borrow(), receiving the funds
     * @param reserve The address of the underlying asset being borrowed
     * @param amount The amount borrowed out
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token id of the underlying NFT used as collateral
     **/
    event Borrow(
        address user,
        address indexed reserve,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address indexed onBehalfOf,
        uint256 borrowRate,
        uint256 loanId
    );

    /**
     * @dev Emitted on repay()
     * @param user The address of the user initiating the repay(), providing the funds
     * @param reserve The address of the underlying asset of the reserve
     * @param amount The amount repaid
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token id of the underlying NFT used as collateral
     * @param borrower The beneficiary of the repayment, getting his debt reduced
     * @param loanId The loan ID of the NFT loans
     **/
    event Repay(
        address user,
        address indexed reserve,
        uint256 amount,
        uint256 interestAmount,
        uint256 feeAmount,
        address indexed nftAsset,
        uint256 nftTokenId,
        address indexed borrower,
        uint256 loanId
    );

    struct RepayLocalVars {
        address initiator;
        address loanManager;
        address onBehalfOf;
        uint256 loanId;
        bool isUpdate;
        uint256 borrowAmount;
        uint256 repayAmount;
        uint256 interestAmount;
        uint256 feeAmount;
    }

    struct ExecuteBorrowLocalVars {
        uint256 shopId;
        address initiator;
        uint256 ltv;
        uint256 liquidationThreshold;
        uint256 liquidationBonus;
        uint256 loanId;
        address reserveOracle;
        address nftOracle;
        address loanAddress;
        uint256 totalSupply;
        uint256 interestRate;
    }

    /**
     * @notice Implements the borrow feature. Through `borrow()`, users borrow assets from the protocol.
     * @dev Emits the `Borrow()` event.
     * @param reservesData The state of all the reserves
     * @param nftsData The state of all the nfts
     * @param params The additional parameters needed to execute the borrow function
     */
    function executeBorrow(
        DataTypes.ShopData memory shop,
        DataTypes.ShopConfiguration storage config,
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        mapping(address => DataTypes.NftsInfo) storage nftsData,
        DataTypes.ExecuteBorrowParams memory params
    ) external {
        _borrow(shop, config, configProvider, reservesData, nftsData, params);
    }

    /**
     * @notice Implements the batch borrow feature. Through `batchBorrow()`, users repay borrow to the protocol.
     * @dev Emits the `Borrow()` event.
     * @param reservesData The state of all the reserves
     * @param nftsData The state of all the nfts
     * @param params The additional parameters needed to execute the batchBorrow function
     */
    function executeBatchBorrow(
        DataTypes.ShopData memory shop,
        mapping(uint256 => mapping(address => mapping(address => DataTypes.ShopConfiguration)))
            storage shopsConfig,
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        mapping(address => DataTypes.NftsInfo) storage nftsData,
        DataTypes.ExecuteBatchBorrowParams memory params
    ) external {
        require(
            params.nftAssets.length == params.assets.length,
            "inconsistent assets length"
        );
        require(
            params.nftAssets.length == params.amounts.length,
            "inconsistent amounts length"
        );
        require(
            params.nftAssets.length == params.nftTokenIds.length,
            "inconsistent tokenIds length"
        );

        for (uint256 i = 0; i < params.nftAssets.length; i++) {
            DataTypes.ShopConfiguration storage shopConfig = shopsConfig[
                shop.id
            ][params.assets[i]][params.nftAssets[i]];
            require(shopConfig.getActive(), Errors.RC_NOT_ACTIVE);
            _borrow(
                shop,
                shopConfig,
                configProvider,
                reservesData,
                nftsData,
                DataTypes.ExecuteBorrowParams({
                    initiator: params.initiator,
                    asset: params.assets[i],
                    amount: params.amounts[i],
                    nftAsset: params.nftAssets[i],
                    nftTokenId: params.nftTokenIds[i],
                    onBehalfOf: params.onBehalfOf,
                    isNative: params.isNative
                })
            );
        }
    }

    function _borrow(
        DataTypes.ShopData memory shop,
        DataTypes.ShopConfiguration storage config,
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        mapping(address => DataTypes.NftsInfo) storage nftsData,
        DataTypes.ExecuteBorrowParams memory params
    ) internal {
        require(
            params.onBehalfOf != address(0),
            Errors.VL_INVALID_ONBEHALFOF_ADDRESS
        );

        ExecuteBorrowLocalVars memory vars;
        vars.initiator = params.initiator;

        DataTypes.ReservesInfo storage reserveData = reservesData[params.asset];
        DataTypes.NftsInfo storage nftData = nftsData[params.nftAsset];

        // Convert asset amount to ETH
        vars.reserveOracle = configProvider.reserveOracle();
        vars.nftOracle = configProvider.nftOracle();
        vars.loanAddress = configProvider.loanManager();
        vars.loanId = IShopLoan(vars.loanAddress).getCollateralLoanId(
            params.nftAsset,
            params.nftTokenId
        );
        if (nftData.maxSupply > 0) {
            vars.totalSupply = IERC721EnumerableUpgradeable(params.nftAsset)
                .totalSupply();
            require(
                vars.totalSupply <= nftData.maxSupply,
                Errors.LP_NFT_SUPPLY_NUM_EXCEED_MAX_LIMIT
            );
            require(
                params.nftTokenId <= nftData.maxSupply,
                Errors.LP_NFT_TOKEN_ID_EXCEED_MAX_LIMIT
            );
        }
        vars.interestRate = config.getInterestRate();

        ValidationLogic.validateBorrow(
            configProvider,
            config,
            params.onBehalfOf,
            params.asset,
            params.amount,
            reserveData,
            params.nftAsset,
            vars.loanAddress,
            vars.loanId,
            vars.reserveOracle,
            vars.nftOracle
        );

        if (vars.loanId == 0) {
            IERC721Upgradeable(params.nftAsset).safeTransferFrom(
                vars.initiator,
                address(this), // shopFactory
                params.nftTokenId
            );

            vars.loanId = IShopLoan(vars.loanAddress).createLoan(
                shop.id,
                params.onBehalfOf,
                params.nftAsset,
                params.nftTokenId,
                params.asset,
                params.amount,
                vars.interestRate
            );
        } else {
            revert("not supported");
        }
        if (
            params.asset == IConfigProvider(configProvider).weth() &&
            params.isNative
        ) {
            //transfer weth from shop to contract
            IERC20Upgradeable(params.asset).transferFrom(
                shop.creator,
                address(this),
                params.amount
            );
            //convert weth to eth and transfer to borrower
            TransferHelper.transferWETH2ETH(
                IConfigProvider(configProvider).weth(),
                vars.initiator,
                params.amount
            );
        } else {
            //transfer asset from shop to borrower
            IERC20Upgradeable(params.asset).transferFrom(
                shop.creator,
                vars.initiator,
                params.amount
            );
        }

        emit Borrow(
            vars.initiator,
            params.asset,
            params.amount,
            params.nftAsset,
            params.nftTokenId,
            params.onBehalfOf,
            config.getInterestRate(),
            vars.loanId
        );
    }

    /**
     * @notice Implements the borrow feature. Through `repay()`, users repay assets to the protocol.
     * @dev Emits the `Repay()` event.
     * @param reservesData The state of all the reserves
     * @param params The additional parameters needed to execute the repay function
     */
    function executeRepay(
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        DataTypes.ExecuteRepayParams memory params
    ) external returns (uint256, uint256, bool) {
        return _repay(configProvider, reservesData, params);
    }

    /**
     * @notice Implements the batch repay feature. Through `batchRepay()`, users repay assets to the protocol.
     * @dev Emits the `repay()` event.
     * @param reservesData The state of all the reserves
     * @param params The additional parameters needed to execute the batchRepay function
     */
    function executeBatchRepay(
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        DataTypes.ExecuteBatchRepayParams memory params
    ) external returns (uint256[] memory, uint256[] memory, bool[] memory) {
        require(
            params.loanIds.length == params.amounts.length,
            "inconsistent amounts length"
        );

        uint256[] memory repayAmounts = new uint256[](params.loanIds.length);
        uint256[] memory feeAmounts = new uint256[](params.loanIds.length);
        bool[] memory repayAlls = new bool[](params.loanIds.length);

        for (uint256 i = 0; i < params.loanIds.length; i++) {
            (repayAmounts[i], feeAmounts[i], repayAlls[i]) = _repay(
                configProvider,
                reservesData,
                DataTypes.ExecuteRepayParams({
                    initiator: params.initiator,
                    loanId: params.loanIds[i],
                    amount: params.amounts[i],
                    shopCreator: params.shopCreator,
                    isNative: params.isNative
                })
            );
        }

        return (repayAmounts, feeAmounts, repayAlls);
    }

    function _repay(
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        DataTypes.ExecuteRepayParams memory params
    )
        internal
        returns (uint256 repayAmount, uint256 feeAmount, bool isFullRepay)
    {
        RepayLocalVars memory vars;

        vars.initiator = params.initiator;
        vars.loanId = params.loanId;
        vars.loanManager = configProvider.loanManager();

        require(vars.loanId != 0, Errors.LP_NFT_IS_NOT_USED_AS_COLLATERAL);

        DataTypes.LoanData memory loanData = IShopLoan(vars.loanManager)
            .getLoan(vars.loanId);

        DataTypes.ReservesInfo storage reserveData = reservesData[
            loanData.reserveAsset
        ];

        vars.borrowAmount = loanData.borrowAmount;

        ValidationLogic.validateRepay(
            reserveData,
            loanData,
            params.amount,
            vars.borrowAmount
        );
        (, , uint256 currentInterest, uint256 platformFee) = GenericLogic
            .calculateInterestInfo(
                GenericLogic.CalculateInterestInfoVars({
                    lastRepaidAt: loanData.lastRepaidAt,
                    borrowAmount: loanData.borrowAmount,
                    interestRate: loanData.interestRate,
                    repayAmount: params.amount,
                    platformFeeRate: configProvider.platformFeePercentage(),
                    interestDuration: configProvider.interestDuration()
                })
            );

        vars.repayAmount = vars.borrowAmount + currentInterest + platformFee;
        vars.interestAmount = currentInterest;
        vars.feeAmount = platformFee;

        vars.isUpdate = false;
        if (params.amount < vars.repayAmount) {
            vars.isUpdate = true;
            vars.repayAmount = params.amount;
        }

        if (vars.isUpdate) {
            IShopLoan(vars.loanManager).partialRepayLoan(
                vars.initiator,
                vars.loanId,
                vars.repayAmount
            );
        } else {
            IShopLoan(vars.loanManager).repayLoan(
                vars.initiator,
                vars.loanId,
                vars.repayAmount
            );
        }
        if (
            loanData.reserveAsset == IConfigProvider(configProvider).weth() &&
            params.isNative
        ) {
            require(
                msg.value == vars.repayAmount,
                Errors.LP_INVALID_ETH_AMOUNT
            );
            // Transfer principal-plus-interest-minus-fees (ETH) to shop
            TransferHelper.safeTransferETH(
                IConfigProvider(configProvider).weth(),
                params.shopCreator,
                vars.repayAmount - vars.feeAmount
            );
            if (vars.feeAmount > 0) {
                // Transfer fees (ETH) to admins
                TransferHelper.safeTransferETH(
                    IConfigProvider(configProvider).weth(),
                    IConfigProvider(configProvider).platformFeeReceiver(),
                    vars.feeAmount
                );
            }
        } else {
            // transfer erc20 to shopCreator
            IERC20Upgradeable(loanData.reserveAsset).safeTransferFrom(
                vars.initiator,
                params.shopCreator,
                vars.repayAmount - vars.feeAmount
            );
            if (vars.feeAmount > 0) {
                // transfer platform fee
                if (configProvider.platformFeeReceiver() != address(this)) {
                    IERC20Upgradeable(loanData.reserveAsset).safeTransferFrom(
                        vars.initiator,
                        configProvider.platformFeeReceiver(),
                        vars.feeAmount
                    );
                }
            }
        }

        // transfer erc721 to borrower
        if (!vars.isUpdate) {
            IERC721Upgradeable(loanData.nftAsset).safeTransferFrom(
                address(this),
                loanData.borrower,
                loanData.nftTokenId
            );
        }

        emit Repay(
            vars.initiator,
            loanData.reserveAsset,
            vars.repayAmount,
            vars.interestAmount,
            vars.feeAmount,
            loanData.nftAsset,
            loanData.nftTokenId,
            loanData.borrower,
            vars.loanId
        );
        repayAmount = vars.repayAmount;
        feeAmount = vars.feeAmount;
        isFullRepay = !vars.isUpdate;
    }
}

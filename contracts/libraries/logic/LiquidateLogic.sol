// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {IConfigProvider} from "../../interfaces/IConfigProvider.sol";
import {IReserveOracleGetter} from "../../interfaces/IReserveOracleGetter.sol";
import {INFTOracleGetter} from "../../interfaces/INFTOracleGetter.sol";
import {IShopLoan} from "../../interfaces/IShopLoan.sol";

import {GenericLogic} from "./GenericLogic.sol";
import {ValidationLogic} from "./ValidationLogic.sol";

import {ShopConfiguration} from "../configuration/ShopConfiguration.sol";
import {PercentageMath} from "../math/PercentageMath.sol";
import {Errors} from "../helpers/Errors.sol";
import {TransferHelper} from "../helpers/TransferHelper.sol";
import {DataTypes} from "../types/DataTypes.sol";

import {IERC20Upgradeable} from "../../openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "../../openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC721Upgradeable} from "../../openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

/**
 * @title LiquidateLogic library
 * @notice Implements the logic to liquidate feature
 */
library LiquidateLogic {
    using PercentageMath for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ShopConfiguration for DataTypes.ShopConfiguration;

    /**
     * @dev Emitted when a borrower's loan is auctioned.
     * @param user The address of the user initiating the auction
     * @param reserve The address of the underlying asset of the reserve
     * @param bidPrice The price of the underlying reserve given by the bidder
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token id of the underlying NFT used as collateral
     * @param onBehalfOf The address that will be getting the NFT
     * @param loanId The loan ID of the NFT loans
     **/
    event Auction(
        address user,
        address indexed reserve,
        uint256 bidPrice,
        address indexed nftAsset,
        uint256 nftTokenId,
        address onBehalfOf,
        address indexed borrower,
        uint256 loanId
    );

    /**
     * @dev Emitted on redeem()
     * @param user The address of the user initiating the redeem(), providing the funds
     * @param reserve The address of the underlying asset of the reserve
     * @param repayPrincipal The borrow amount repaid
     * @param interest interest
     * @param fee fee
     * @param fineAmount penalty amount
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token id of the underlying NFT used as collateral
     * @param loanId The loan ID of the NFT loans
     **/
    event Redeem(
        address user,
        address indexed reserve,
        uint256 repayPrincipal,
        uint256 interest,
        uint256 fee,
        uint256 fineAmount,
        address indexed nftAsset,
        uint256 nftTokenId,
        address indexed borrower,
        uint256 loanId
    );

    /**
     * @dev Emitted when a borrower's loan is liquidated.
     * @param user The address of the user initiating the auction
     * @param reserve The address of the underlying asset of the reserve
     * @param repayAmount The amount of reserve repaid by the liquidator
     * @param remainAmount The amount of reserve received by the borrower
     * @param loanId The loan ID of the NFT loans
     **/
    event Liquidate(
        address user,
        address indexed reserve,
        uint256 repayAmount,
        uint256 remainAmount,
        uint256 feeAmount,
        address indexed nftAsset,
        uint256 nftTokenId,
        address indexed borrower,
        uint256 loanId
    );

    struct AuctionLocalVars {
        address loanAddress;
        address reserveOracle;
        address nftOracle;
        address initiator;
        uint256 loanId;
        uint256 thresholdPrice;
        uint256 liquidatePrice;
        uint256 totalDebt;
        uint256 auctionEndTimestamp;
        uint256 minBidDelta;
    }

    /**
     * @notice Implements the auction feature. Through `auction()`, users auction assets in the protocol.
     * @dev Emits the `Auction()` event.
     * @param reservesData The state of all the reserves
     * @param nftsData The state of all the nfts
     * @param params The additional parameters needed to execute the auction function
     */
    function executeAuction(
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        mapping(address => DataTypes.NftsInfo) storage nftsData,
        DataTypes.ExecuteAuctionParams memory params
    ) external {
        require(
            params.onBehalfOf != address(0),
            Errors.VL_INVALID_ONBEHALFOF_ADDRESS
        );
        AuctionLocalVars memory vars;
        vars.initiator = params.initiator;

        vars.loanAddress = configProvider.loanManager();
        vars.reserveOracle = configProvider.reserveOracle();
        vars.nftOracle = configProvider.nftOracle();

        vars.loanId = params.loanId;
        require(vars.loanId != 0, Errors.LP_NFT_IS_NOT_USED_AS_COLLATERAL);

        DataTypes.LoanData memory loanData = IShopLoan(vars.loanAddress)
            .getLoan(vars.loanId);

        DataTypes.ReservesInfo storage reserveData = reservesData[
            loanData.reserveAsset
        ];
        DataTypes.NftsInfo storage nftData = nftsData[loanData.nftAsset];

        ValidationLogic.validateAuction(
            reserveData,
            nftData,
            loanData,
            params.bidPrice
        );

        (
            vars.totalDebt,
            vars.thresholdPrice,
            vars.liquidatePrice,

        ) = GenericLogic.calculateLoanLiquidatePrice(
            configProvider,
            vars.loanId,
            loanData.reserveAsset,
            reserveData,
            loanData.nftAsset
        );
        // first time bid need to burn debt tokens and transfer reserve to bTokens
        if (loanData.state == DataTypes.LoanState.Active) {
            // loan's accumulated debt must exceed threshold (heath factor below 1.0)
            require(
                vars.totalDebt > vars.thresholdPrice ||
                    loanData.expiredAt < block.timestamp,
                Errors.LP_BORROW_NOT_EXCEED_LIQUIDATION_THRESHOLD_OR_EXPIRED
            );
            // bid price must greater than liquidate price
            require(
                params.bidPrice >= vars.liquidatePrice,
                Errors.LPL_BID_PRICE_LESS_THAN_LIQUIDATION_PRICE
            );
            // bid price must greater than borrow debt
            require(
                params.bidPrice >= vars.totalDebt,
                Errors.LPL_BID_PRICE_LESS_THAN_BORROW
            );
        } else {
            // bid price must greater than borrow debt
            require(
                params.bidPrice >= vars.totalDebt,
                Errors.LPL_BID_PRICE_LESS_THAN_BORROW
            );

            vars.auctionEndTimestamp =
                loanData.bidStartTimestamp +
                configProvider.auctionDuration();
            require(
                block.timestamp <= vars.auctionEndTimestamp,
                Errors.LPL_BID_AUCTION_DURATION_HAS_END
            );

            // bid price must greater than highest bid + delta
            vars.minBidDelta = vars.totalDebt.percentMul(
                configProvider.minBidDeltaPercentage()
            );
            require(
                params.bidPrice >= (loanData.bidPrice + vars.minBidDelta),
                Errors.LPL_BID_PRICE_LESS_THAN_HIGHEST_PRICE
            );
        }

        IShopLoan(vars.loanAddress).auctionLoan(
            vars.initiator,
            vars.loanId,
            params.onBehalfOf,
            params.bidPrice,
            vars.totalDebt
        );

        // lock highest bidder bid price amount to lend pool
        if (
            GenericLogic.isWETHAddress(configProvider, loanData.reserveAsset) &&
            params.isNative
        ) {
            //auction by eth, already convert to weth in factory
            //do nothing
        } else {
            IERC20Upgradeable(loanData.reserveAsset).safeTransferFrom(
                vars.initiator,
                address(this),
                params.bidPrice
            );
        }

        // transfer (return back) last bid price amount to previous bidder from lend pool
        if (loanData.bidderAddress != address(0)) {
            if (
                GenericLogic.isWETHAddress(
                    configProvider,
                    loanData.reserveAsset
                )
            ) {
                // transfer (return back eth)  last bid price amount from lend pool to bidder
                TransferHelper.transferWETH2ETH(
                    loanData.reserveAsset,
                    loanData.bidderAddress,
                    loanData.bidPrice
                );
            } else {
                IERC20Upgradeable(loanData.reserveAsset).safeTransfer(
                    loanData.bidderAddress,
                    loanData.bidPrice
                );
            }
        }
        emit Auction(
            vars.initiator,
            loanData.reserveAsset,
            params.bidPrice,
            loanData.nftAsset,
            loanData.nftTokenId,
            params.onBehalfOf,
            loanData.borrower,
            vars.loanId
        );
    }

    struct RedeemLocalVars {
        address initiator;
        address poolLoan;
        address reserveOracle;
        address nftOracle;
        uint256 loanId;
        uint256 borrowAmount;
        uint256 repayAmount;
        uint256 minRepayAmount;
        uint256 maxRepayAmount;
        uint256 bidFine;
        uint256 redeemEndTimestamp;
        uint256 minBidFinePct;
        uint256 minBidFine;
    }

    /**
     * @notice Implements the redeem feature. Through `redeem()`, users redeem assets in the protocol.
     * @dev Emits the `Redeem()` event.
     * @param reservesData The state of all the reserves
     * @param nftsData The state of all the nfts
     * @param params The additional parameters needed to execute the redeem function
     */
    function executeRedeem(
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        mapping(address => DataTypes.NftsInfo) storage nftsData,
        DataTypes.ExecuteRedeemParams memory params
    )
        external
        returns (
            uint256 remainAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        )
    {
        RedeemLocalVars memory vars;
        vars.initiator = params.initiator;

        vars.poolLoan = configProvider.loanManager();
        vars.reserveOracle = configProvider.reserveOracle();
        vars.nftOracle = configProvider.nftOracle();

        vars.loanId = params.loanId;
        require(vars.loanId != 0, Errors.LP_NFT_IS_NOT_USED_AS_COLLATERAL);

        DataTypes.LoanData memory loanData = IShopLoan(vars.poolLoan).getLoan(
            vars.loanId
        );

        DataTypes.ReservesInfo storage reserveData = reservesData[
            loanData.reserveAsset
        ];
        DataTypes.NftsInfo storage nftData = nftsData[loanData.nftAsset];

        ValidationLogic.validateRedeem(
            reserveData,
            nftData,
            loanData,
            params.amount
        );

        vars.redeemEndTimestamp = (loanData.bidStartTimestamp +
            configProvider.redeemDuration());
        require(
            block.timestamp <= vars.redeemEndTimestamp,
            Errors.LPL_BID_REDEEM_DURATION_HAS_END
        );

        (vars.borrowAmount, , , ) = GenericLogic.calculateLoanLiquidatePrice(
            configProvider,
            vars.loanId,
            loanData.reserveAsset,
            reserveData,
            loanData.nftAsset
        );

        // check bid fine in min & max range
        (, vars.bidFine) = GenericLogic.calculateLoanBidFine(
            configProvider,
            loanData.reserveAsset,
            reserveData,
            loanData.nftAsset,
            loanData,
            vars.poolLoan,
            vars.reserveOracle
        );

        // check bid fine is enough
        require(vars.bidFine == params.bidFine, Errors.LPL_INVALID_BID_FINE);

        // check the minimum debt repay amount, use redeem threshold in config
        vars.repayAmount = params.amount;
        vars.minRepayAmount = vars.borrowAmount.percentMul(
            configProvider.redeemThreshold()
        );
        require(
            vars.repayAmount >= vars.minRepayAmount,
            Errors.LP_AMOUNT_LESS_THAN_REDEEM_THRESHOLD
        );

        // // check the maxinmum debt repay amount, 90%?
        // vars.maxRepayAmount = vars.borrowAmount.percentMul(
        //     PercentageMath.PERCENTAGE_FACTOR - PercentageMath.TEN_PERCENT
        // );
        // require(
        //     vars.repayAmount <= vars.maxRepayAmount,
        //     Errors.LP_AMOUNT_GREATER_THAN_MAX_REPAY
        // );

        (remainAmount, repayPrincipal, interest, fee) = IShopLoan(vars.poolLoan)
            .redeemLoan(vars.initiator, vars.loanId, vars.repayAmount);

        if (
            GenericLogic.isWETHAddress(configProvider, loanData.reserveAsset) &&
            params.isNative
        ) {
            // transfer repayAmount - fee from factory to shopCreator
            IERC20Upgradeable(loanData.reserveAsset).safeTransfer(
                params.shopCreator,
                (repayPrincipal + interest)
            );

            if (fee > 0) {
                // transfer platform fee from factory
                IERC20Upgradeable(loanData.reserveAsset).safeTransfer(
                    configProvider.platformFeeReceiver(),
                    fee
                );
            }
            if (params.amount > (repayPrincipal + interest + fee)) {
                revert('test');
                TransferHelper.transferWETH2ETH(
                    loanData.reserveAsset,
                    vars.initiator,
                    params.amount - (repayPrincipal + interest + fee)
                );
            }
        } else {
            // transfer repayAmount - fee from borrower to shopCreator
            IERC20Upgradeable(loanData.reserveAsset).safeTransferFrom(
                vars.initiator,
                params.shopCreator,
                (repayPrincipal + interest)
            );
            if (fee > 0) {
                // transfer platform fee
                IERC20Upgradeable(loanData.reserveAsset).safeTransferFrom(
                    vars.initiator,
                    configProvider.platformFeeReceiver(),
                    fee
                );
            }
        }

        if (loanData.bidderAddress != address(0)) {
            if (
                GenericLogic.isWETHAddress(
                    configProvider,
                    loanData.reserveAsset
                )
            ) {
                // transfer (return back) last bid price amount from lend pool to bidder
                TransferHelper.transferWETH2ETH(
                    loanData.reserveAsset,
                    loanData.bidderAddress,
                    loanData.bidPrice
                );

                if (params.isNative) {
                    // transfer bid penalty fine amount(eth) from contract to borrower
                    TransferHelper.transferWETH2ETH(
                        loanData.reserveAsset,
                        loanData.firstBidderAddress,
                        vars.bidFine
                    );
                } else {
                    // transfer bid penalty fine amount(weth) from borrower this contract
                    IERC20Upgradeable(loanData.reserveAsset).safeTransferFrom(
                        vars.initiator,
                        address(this),
                        vars.bidFine
                    );
                    // transfer bid penalty fine amount(eth) from contract to borrower
                    TransferHelper.transferWETH2ETH(
                        loanData.reserveAsset,
                        loanData.firstBidderAddress,
                        vars.bidFine
                    );
                }
            } else {
                // transfer (return back) last bid price amount from lend pool to bidder
                IERC20Upgradeable(loanData.reserveAsset).safeTransfer(
                    loanData.bidderAddress,
                    loanData.bidPrice
                );

                // transfer bid penalty fine amount from borrower to the first bidder
                IERC20Upgradeable(loanData.reserveAsset).safeTransferFrom(
                    vars.initiator,
                    loanData.firstBidderAddress,
                    vars.bidFine
                );
            }
        }

        if (remainAmount == 0) {
            // transfer erc721 to borrower
            IERC721Upgradeable(loanData.nftAsset).safeTransferFrom(
                address(this),
                loanData.borrower,
                loanData.nftTokenId
            );
        }

        emit Redeem(
            vars.initiator,
            loanData.reserveAsset,
            repayPrincipal,
            interest,
            fee,
            vars.bidFine,
            loanData.nftAsset,
            loanData.nftTokenId,
            loanData.borrower,
            vars.loanId
        );
    }

    struct LiquidateLocalVars {
        address initiator;
        uint256 loanId;
        uint256 borrowAmount;
        uint256 feeAmount;
        uint256 remainAmount;
        uint256 auctionEndTimestamp;
    }

    /**
     * @notice Implements the liquidate feature. Through `liquidate()`, users liquidate assets in the protocol.
     * @dev Emits the `Liquidate()` event.
     * @param reservesData The state of all the reserves
     * @param nftsData The state of all the nfts
     * @param params The additional parameters needed to execute the liquidate function
     */
    function executeLiquidate(
        IConfigProvider configProvider,
        mapping(address => DataTypes.ReservesInfo) storage reservesData,
        mapping(address => DataTypes.NftsInfo) storage nftsData,
        DataTypes.ExecuteLiquidateParams memory params
    ) external {
        LiquidateLocalVars memory vars;
        vars.initiator = params.initiator;

        vars.loanId = params.loanId;
        require(vars.loanId != 0, Errors.LP_NFT_IS_NOT_USED_AS_COLLATERAL);

        DataTypes.LoanData memory loanData = IShopLoan(
            configProvider.loanManager()
        ).getLoan(vars.loanId);

        DataTypes.ReservesInfo storage reserveData = reservesData[
            loanData.reserveAsset
        ];
        DataTypes.NftsInfo storage nftData = nftsData[loanData.nftAsset];

        ValidationLogic.validateLiquidate(reserveData, nftData, loanData);

        vars.auctionEndTimestamp =
            loanData.bidStartTimestamp +
            configProvider.auctionDuration();
        require(
            block.timestamp > vars.auctionEndTimestamp,
            Errors.LPL_BID_AUCTION_DURATION_NOT_END
        );

        (vars.borrowAmount, , , vars.feeAmount) = GenericLogic
            .calculateLoanLiquidatePrice(
                configProvider,
                vars.loanId,
                loanData.reserveAsset,
                reserveData,
                loanData.nftAsset
            );

        if (loanData.bidPrice > vars.borrowAmount) {
            vars.remainAmount = loanData.bidPrice - vars.borrowAmount;
        }

        IShopLoan(configProvider.loanManager()).liquidateLoan(
            loanData.bidderAddress,
            vars.loanId,
            vars.borrowAmount
        );

        // transfer borrow_amount - fee from shopFactory to shop creator
        if (vars.borrowAmount > 0) {
            IERC20Upgradeable(loanData.reserveAsset).safeTransfer(
                params.shopCreator,
                vars.borrowAmount - vars.feeAmount
            );
        }

        // transfer fee platform receiver
        if (vars.feeAmount > 0) {
            if (configProvider.platformFeeReceiver() != address(this)) {
                IERC20Upgradeable(loanData.reserveAsset).safeTransfer(
                    configProvider.platformFeeReceiver(),
                    vars.feeAmount
                );
            }
        }

        // transfer remain amount to borrower
        if (vars.remainAmount > 0) {
            if (
                GenericLogic.isWETHAddress(
                    configProvider,
                    loanData.reserveAsset
                )
            ) {
                // transfer (return back) last bid price amount from lend pool to bidder
                TransferHelper.transferWETH2ETH(
                    loanData.reserveAsset,
                    loanData.borrower,
                    vars.remainAmount
                );
            } else {
                IERC20Upgradeable(loanData.reserveAsset).safeTransfer(
                    loanData.borrower,
                    vars.remainAmount
                );
            }
        }

        // transfer erc721 to bidder
        IERC721Upgradeable(loanData.nftAsset).safeTransferFrom(
            address(this),
            loanData.bidderAddress,
            loanData.nftTokenId
        );

        emit Liquidate(
            vars.initiator,
            loanData.reserveAsset,
            vars.borrowAmount,
            vars.remainAmount,
            vars.feeAmount,
            loanData.nftAsset,
            loanData.nftTokenId,
            loanData.borrower,
            vars.loanId
        );
    }
}

// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {IBNFT} from "../interfaces/IBNFT.sol";
import {IShopLoan} from "../interfaces/IShopLoan.sol";
import {IShop} from "../interfaces/IShop.sol";
import {IConfigProvider} from "../interfaces/IConfigProvider.sol";
import {IBNFTRegistry} from "../interfaces/IBNFTRegistry.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {Constants} from "../libraries/configuration/Constants.sol";

import {IERC721Upgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {IERC721ReceiverUpgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import {CountersUpgradeable} from "../openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import {Initializable} from "../openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ContextUpgradeable} from "../openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {GenericLogic} from "../libraries/logic/GenericLogic.sol";

contract ShopLoan is
    Initializable,
    IShopLoan,
    ContextUpgradeable,
    IERC721ReceiverUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;

    IConfigProvider private _provider;

    CountersUpgradeable.Counter private _loanIdTracker;
    mapping(uint256 => DataTypes.LoanData) private _loans;

    // nftAsset + nftTokenId => loanId
    mapping(address => mapping(uint256 => uint256)) private _nftToLoanIds;
    mapping(address => uint256) private _nftTotalCollateral;
    mapping(address => mapping(address => uint256)) private _userNftCollateral;

    /**
     * @dev Only lending pool can call functions marked by this modifier
     **/
    modifier onlyShopFactory() {
        require(
            _msgSender() == address(_getShopFactory()),
            Errors.CT_CALLER_MUST_BE_LEND_POOL
        );
        _;
    }

    // called once by the factory at time of deployment
    function initialize(IConfigProvider provider) external initializer {
        __Context_init();

        _provider = provider;

        // Avoid having loanId = 0
        _loanIdTracker.increment();

        emit Initialized(address(_getShopFactory()));
    }

    function initNft(address nftAsset) external override onlyShopFactory {
        IBNFTRegistry bnftRegistry = IBNFTRegistry(_provider.bnftRegistry());
        address bNftAddress = bnftRegistry.getBNFTAddresses(nftAsset);
        IERC721Upgradeable(nftAsset).setApprovalForAll(bNftAddress, true);
    }

    /**
     * @inheritdoc IShopLoan
     */
    function createLoan(
        uint256 shopId,
        address borrower,
        address nftAsset,
        uint256 nftTokenId,
        address reserveAsset,
        uint256 amount,
        uint256 interestRate
    ) external override onlyShopFactory returns (uint256) {
        require(
            _nftToLoanIds[nftAsset][nftTokenId] == 0,
            Errors.LP_NFT_HAS_USED_AS_COLLATERAL
        );

        uint256 loanId = _loanIdTracker.current();
        _loanIdTracker.increment();

        _nftToLoanIds[nftAsset][nftTokenId] = loanId;

        // transfer underlying NFT asset to pool and mint bNFT to onBehalfOf
        IERC721Upgradeable(nftAsset).safeTransferFrom(
            _msgSender(), // shopFactory
            address(this),
            nftTokenId
        );

        address bNftAddress = GenericLogic.getBNftAddress(_provider, nftAsset);
        if (
            !IERC721Upgradeable(nftAsset).isApprovedForAll(
                address(this),
                bNftAddress
            )
        ) {
            IERC721Upgradeable(nftAsset).setApprovalForAll(bNftAddress, true);
        }
        IBNFT(bNftAddress).mint(borrower, nftTokenId);

        // Save Info
        DataTypes.LoanData storage loanData = _loans[loanId];
        loanData.shopId = shopId;
        loanData.loanId = loanId;
        loanData.state = DataTypes.LoanState.Active;
        loanData.borrower = borrower;
        loanData.nftAsset = nftAsset;
        loanData.nftTokenId = nftTokenId;
        loanData.reserveAsset = reserveAsset;
        loanData.borrowAmount = amount;

        loanData.createdAt = block.timestamp;
        loanData.updatedAt = block.timestamp;
        loanData.lastRepaidAt = block.timestamp;
        loanData.expiredAt = block.timestamp + _provider.maxLoanDuration();
        loanData.interestRate = interestRate;

        _userNftCollateral[borrower][nftAsset] += 1;

        _nftTotalCollateral[nftAsset] += 1;

        emit LoanCreated(
            borrower,
            loanId,
            nftAsset,
            nftTokenId,
            reserveAsset,
            amount
        );

        return (loanId);
    }

    /**
     * @inheritdoc IShopLoan
     */
    function partialRepayLoan(
        address initiator,
        uint256 loanId,
        uint256 repayAmount
    ) external override onlyShopFactory {
        // Must use storage to change state
        DataTypes.LoanData storage loan = _loans[loanId];
        // Ensure valid loan state
        require(
            loan.state == DataTypes.LoanState.Active,
            Errors.LPL_INVALID_LOAN_STATE
        );
        uint256 currentInterest = 0;
        if (repayAmount > 0) {
            (, uint256 repayPrincipal, , ) = GenericLogic.calculateInterestInfo(
                GenericLogic.CalculateInterestInfoVars({
                    lastRepaidAt: loan.lastRepaidAt,
                    borrowAmount: loan.borrowAmount,
                    interestRate: loan.interestRate,
                    repayAmount: repayAmount,
                    platformFeeRate: _provider.platformFeePercentage(),
                    interestDuration: _provider.interestDuration()
                })
            );
            require(
                loan.borrowAmount > repayPrincipal,
                Errors.LPL_INVALID_LOAN_AMOUNT
            );
            loan.borrowAmount = loan.borrowAmount - repayPrincipal;
            loan.lastRepaidAt = block.timestamp;
            require(loan.borrowAmount > 0, Errors.LPL_INVALID_LOAN_AMOUNT);
        }
        emit LoanPartialRepay(
            initiator,
            loanId,
            loan.nftAsset,
            loan.nftTokenId,
            loan.reserveAsset,
            repayAmount,
            currentInterest
        );
    }

    /**
     * @inheritdoc IShopLoan
     */
    function repayLoan(
        address initiator,
        uint256 loanId,
        uint256 amount
    ) external override onlyShopFactory {
        // Must use storage to change state
        DataTypes.LoanData storage loan = _loans[loanId];

        // Ensure valid loan state
        require(
            loan.state == DataTypes.LoanState.Active,
            Errors.LPL_INVALID_LOAN_STATE
        );

        _repayLoan(initiator, loan, amount);
    }

    function _repayLoan(
        address initiator,
        DataTypes.LoanData storage loan,
        uint256 amount
    ) internal {
        // state changes and cleanup
        // NOTE: these must be performed before assets are released to prevent reentrance
        _loans[loan.loanId].state = DataTypes.LoanState.Repaid;
        _loans[loan.loanId].borrowAmount = 0;
        _loans[loan.loanId].lastRepaidAt = block.timestamp;

        _nftToLoanIds[loan.nftAsset][loan.nftTokenId] = 0;

        require(
            _userNftCollateral[loan.borrower][loan.nftAsset] >= 1,
            Errors.LP_INVALIED_USER_NFT_AMOUNT
        );
        _userNftCollateral[loan.borrower][loan.nftAsset] -= 1;

        require(
            _nftTotalCollateral[loan.nftAsset] >= 1,
            Errors.LP_INVALIED_NFT_AMOUNT
        );
        _nftTotalCollateral[loan.nftAsset] -= 1;

        address bNftAddress = GenericLogic.getBNftAddress(
            _provider,
            loan.nftAsset
        );
        IBNFT(bNftAddress).burn(loan.nftTokenId);

        IERC721Upgradeable(loan.nftAsset).safeTransferFrom(
            address(this),
            _msgSender(),
            loan.nftTokenId
        );
        emit LoanRepaid(
            initiator,
            loan.loanId,
            loan.nftAsset,
            loan.nftTokenId,
            loan.reserveAsset,
            amount
        );
    }

    /**
     * @inheritdoc IShopLoan
     */
    function auctionLoan(
        address initiator,
        uint256 loanId,
        address onBehalfOf,
        uint256 bidPrice,
        uint256 totalDebt
    ) external override onlyShopFactory {
        // Must use storage to change state
        DataTypes.LoanData storage loan = _loans[loanId];
        address previousBidder = loan.bidderAddress;
        uint256 previousPrice = loan.bidPrice;
        // Ensure valid loan state
        if (loan.bidStartTimestamp == 0) {
            require(
                loan.state == DataTypes.LoanState.Active,
                Errors.LPL_INVALID_LOAN_STATE
            );
            loan.state = DataTypes.LoanState.Auction;
            loan.bidStartTimestamp = block.timestamp;
            loan.firstBidderAddress = onBehalfOf;
        } else {
            require(
                loan.state == DataTypes.LoanState.Auction,
                Errors.LPL_INVALID_LOAN_STATE
            );
            require(
                bidPrice > loan.bidPrice,
                Errors.LPL_BID_PRICE_LESS_THAN_HIGHEST_PRICE
            );
        }
        loan.bidBorrowAmount = totalDebt;
        loan.bidderAddress = onBehalfOf;
        loan.bidPrice = bidPrice;
        emit LoanAuctioned(
            initiator,
            loanId,
            loan.nftAsset,
            loan.nftTokenId,
            loan.bidBorrowAmount,
            onBehalfOf,
            bidPrice,
            previousBidder,
            previousPrice
        );
    }

    // /**
    //  * @inheritdoc IShopLoan
    //  */
    function redeemLoan(
        address initiator,
        uint256 loanId,
        uint256 repayAmount
    )
        external
        override
        onlyShopFactory
        returns (
            uint256 remainAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        )
    {
        // Must use storage to change state
        DataTypes.LoanData storage loan = _loans[loanId];
        // Ensure valid loan state
        require(
            loan.state == DataTypes.LoanState.Auction,
            Errors.LPL_INVALID_LOAN_STATE
        );
        if (repayAmount > 0) {
            (, repayPrincipal, interest, fee) = GenericLogic
                .calculateInterestInfo(
                    GenericLogic.CalculateInterestInfoVars({
                        lastRepaidAt: loan.lastRepaidAt,
                        borrowAmount: loan.borrowAmount,
                        interestRate: loan.interestRate,
                        repayAmount: repayAmount,
                        platformFeeRate: _provider.platformFeePercentage(),
                        interestDuration: _provider.interestDuration()
                    })
                );
            require(
                loan.borrowAmount >= repayPrincipal,
                Errors.LPL_INVALID_LOAN_AMOUNT
            );
            loan.borrowAmount = loan.borrowAmount - repayPrincipal;
            loan.lastRepaidAt = block.timestamp;
            loan.state = DataTypes.LoanState.Active;
            loan.bidStartTimestamp = 0;
            loan.bidBorrowAmount = 0;
            loan.bidderAddress = address(0);
            loan.bidPrice = 0;
            loan.firstBidderAddress = address(0);
            remainAmount = loan.borrowAmount;
            if (loan.borrowAmount == 0) {
                _repayLoan(initiator, loan, repayAmount);
            }
        }
        //

        emit LoanRedeemed(
            initiator,
            loanId,
            loan.nftAsset,
            loan.nftTokenId,
            loan.reserveAsset,
            repayAmount
        );
    }

    /**
     * @inheritdoc IShopLoan
     */
    function liquidateLoan(
        address initiator,
        uint256 loanId,
        uint256 borrowAmount
    ) external override onlyShopFactory {
        // Must use storage to change state
        DataTypes.LoanData storage loan = _loans[loanId];

        // Ensure valid loan state
        require(
            loan.state == DataTypes.LoanState.Auction,
            Errors.LPL_INVALID_LOAN_STATE
        );

        // state changes and cleanup
        // NOTE: these must be performed before assets are released to prevent reentrance
        _loans[loanId].state = DataTypes.LoanState.Defaulted;
        _loans[loanId].bidBorrowAmount = borrowAmount;

        _nftToLoanIds[loan.nftAsset][loan.nftTokenId] = 0;

        require(
            _userNftCollateral[loan.borrower][loan.nftAsset] >= 1,
            Errors.LP_INVALIED_USER_NFT_AMOUNT
        );
        _userNftCollateral[loan.borrower][loan.nftAsset] -= 1;

        require(
            _nftTotalCollateral[loan.nftAsset] >= 1,
            Errors.LP_INVALIED_NFT_AMOUNT
        );
        _nftTotalCollateral[loan.nftAsset] -= 1;

        // burn bNFT and transfer underlying NFT asset to user
        address bNftAddress = GenericLogic.getBNftAddress(
            _provider,
            loan.nftAsset
        );

        IBNFT(bNftAddress).burn(loan.nftTokenId);

        IERC721Upgradeable(loan.nftAsset).safeTransferFrom(
            address(this),
            _msgSender(),
            loan.nftTokenId
        );

        emit LoanLiquidated(
            initiator,
            loanId,
            loan.nftAsset,
            loan.nftTokenId,
            loan.reserveAsset,
            borrowAmount
        );
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        operator;
        from;
        tokenId;
        data;
        return IERC721ReceiverUpgradeable.onERC721Received.selector;
    }

    function borrowerOf(uint256 loanId)
        external
        view
        override
        returns (address)
    {
        return _loans[loanId].borrower;
    }

    function getCollateralLoanId(address nftAsset, uint256 nftTokenId)
        external
        view
        override
        returns (uint256)
    {
        return _nftToLoanIds[nftAsset][nftTokenId];
    }

    function getLoan(uint256 loanId)
        external
        view
        override
        returns (DataTypes.LoanData memory loanData)
    {
        return _loans[loanId];
    }

    function totalDebtInReserve(uint256 loanId, uint256 repayAmount)
        external
        view
        override
        returns (
            address asset,
            uint256 borrowAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        )
    {
        asset = _loans[loanId].reserveAsset;
        (, repayPrincipal, interest, fee) = GenericLogic.calculateInterestInfo(
            GenericLogic.CalculateInterestInfoVars({
                lastRepaidAt: _loans[loanId].lastRepaidAt,
                borrowAmount: _loans[loanId].borrowAmount,
                interestRate: _loans[loanId].interestRate,
                repayAmount: repayAmount,
                platformFeeRate: _provider.platformFeePercentage(),
                interestDuration: _provider.interestDuration()
            })
        );
        return (
            asset,
            _loans[loanId].borrowAmount,
            repayPrincipal,
            interest,
            fee
        );
    }

    function getLoanHighestBid(uint256 loanId)
        external
        view
        override
        returns (address, uint256)
    {
        return (_loans[loanId].bidderAddress, _loans[loanId].bidPrice);
    }

    function _getShopFactory() internal view returns (address) {
        return IConfigProvider(_provider).shopFactory();
    }
}

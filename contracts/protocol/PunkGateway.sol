// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {Errors} from "../libraries/helpers/Errors.sol";
import {IPunks} from "../interfaces/IPunks.sol";
import {IWrappedPunks} from "../interfaces/IWrappedPunks.sol";
import {IPunkGateway} from "../interfaces/IPunkGateway.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";

import {ERC721HolderUpgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import {IERC721Upgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {IERC20Upgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import {Errors} from "../libraries/helpers/Errors.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {IConfigProvider} from "../interfaces/IConfigProvider.sol";
import {IShop} from "../interfaces/IShop.sol";
import {IShopLoan} from "../interfaces/IShopLoan.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";

import {EmergencyTokenRecoveryUpgradeable} from "./EmergencyTokenRecoveryUpgradeable.sol";

contract PunkGateway is
    IPunkGateway,
    ERC721HolderUpgradeable,
    EmergencyTokenRecoveryUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IConfigProvider internal _addressProvider;

    IPunks public punks;
    IWrappedPunks public wrappedPunks;
    address public proxy;

    mapping(address => bool) internal _callerWhitelists;

    uint256 private constant _NOT_ENTERED = 0;
    uint256 private constant _ENTERED = 1;
    uint256 private _status;

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
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

    function initialize(
        address addressProvider,
        address _punks,
        address _wrappedPunks
    ) public initializer {
        __ERC721Holder_init();
        __EmergencyTokenRecovery_init();

        _addressProvider = IConfigProvider(addressProvider);

        punks = IPunks(_punks);
        wrappedPunks = IWrappedPunks(_wrappedPunks);
        wrappedPunks.registerProxy();
        proxy = wrappedPunks.proxyInfo(address(this));

        IERC721Upgradeable(address(wrappedPunks)).setApprovalForAll(
            address(_getShopFactory()),
            true
        );
    }

    function getShopFactory() external view returns (IShop) {
        return IShop(_addressProvider.shopFactory());
    }

    function _getShopFactory() internal view returns (IShop) {
        return IShop(_addressProvider.shopFactory());
    }

    function _getLoanManager() internal view returns (IShopLoan) {
        return IShopLoan(_addressProvider.loanManager());
    }

    function authorizeLendPoolNFT(
        address[] calldata nftAssets
    ) external nonReentrant onlyOwner {
        for (uint256 i = 0; i < nftAssets.length; i++) {
            require(
                !IERC721Upgradeable(nftAssets[i]).isApprovedForAll(
                    address(this),
                    address(_getShopFactory())
                ),
                "nft is approved"
            );
            IERC721Upgradeable(nftAssets[i]).setApprovalForAll(
                address(_getShopFactory()),
                true
            );
        }
    }

    function authorizeLendPoolERC20(
        address[] calldata tokens
    ) external nonReentrant onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20Upgradeable(tokens[i]).approve(
                address(_getShopFactory()),
                type(uint256).max
            );
        }
    }

    function authorizeCallerWhitelist(
        address[] calldata callers,
        bool flag
    ) external nonReentrant onlyOwner {
        for (uint256 i = 0; i < callers.length; i++) {
            _callerWhitelists[callers[i]] = flag;
        }
    }

    function isCallerInWhitelist(address caller) external view returns (bool) {
        return _callerWhitelists[caller];
    }

    function _checkValidCallerAndOnBehalfOf(address onBehalfOf) internal view {
        require(
            (onBehalfOf == _msgSender()) ||
                (_callerWhitelists[_msgSender()] == true),
            Errors.CALLER_NOT_ONBEHALFOF_OR_IN_WHITELIST
        );
    }

    function _depositPunk(uint256 punkIndex) internal {
        IShopLoan loanManager = _getLoanManager();

        uint256 loanId = loanManager.getCollateralLoanId(
            address(wrappedPunks),
            punkIndex
        );
        if (loanId != 0) {
            return;
        }

        address owner = punks.punkIndexToAddress(punkIndex);
        require(owner == _msgSender(), "PunkGateway: not owner of punkIndex");

        punks.buyPunk(punkIndex);
        punks.transferPunk(proxy, punkIndex);

        wrappedPunks.mint(punkIndex);
    }

    function borrow(
        uint256 shopId,
        address reserveAsset,
        uint256 amount,
        uint256 punkIndex,
        address onBehalfOf
    ) external override nonReentrant {
        _checkValidCallerAndOnBehalfOf(onBehalfOf);

        IShop shopFactory = _getShopFactory();

        _depositPunk(punkIndex);

        shopFactory.borrow(
            shopId,
            reserveAsset,
            amount,
            address(wrappedPunks),
            punkIndex,
            onBehalfOf
        );

        IERC20Upgradeable(reserveAsset).transfer(onBehalfOf, amount);
    }

    function batchBorrow(
        uint256 shopId,
        address[] calldata reserveAssets,
        uint256[] calldata amounts,
        uint256[] calldata punkIndexs,
        address onBehalfOf
    ) external override nonReentrant {
        require(
            reserveAssets.length == amounts.length,
            "inconsistent reserveAssets length"
        );
        require(
            amounts.length == punkIndexs.length,
            "inconsistent amounts length"
        );

        _checkValidCallerAndOnBehalfOf(onBehalfOf);

        IShop shopFactory = _getShopFactory();

        for (uint256 i = 0; i < punkIndexs.length; i++) {
            _depositPunk(punkIndexs[i]);

            shopFactory.borrow(
                shopId,
                reserveAssets[i],
                amounts[i],
                address(wrappedPunks),
                punkIndexs[i],
                onBehalfOf
            );

            IERC20Upgradeable(reserveAssets[i]).transfer(
                onBehalfOf,
                amounts[i]
            );
        }
    }

    function _withdrawPunk(uint256 punkIndex, address onBehalfOf) internal {
        address owner = wrappedPunks.ownerOf(punkIndex);
        require(owner == _msgSender(), "PunkGateway: caller is not owner");
        require(owner == onBehalfOf, "PunkGateway: onBehalfOf is not owner");

        wrappedPunks.safeTransferFrom(onBehalfOf, address(this), punkIndex);
        wrappedPunks.burn(punkIndex);
        punks.transferPunk(onBehalfOf, punkIndex);
    }

    function repay(
        uint256 loanId,
        uint256 amount
    ) external override nonReentrant returns (uint256, uint256, bool) {
        return _repay(loanId, amount);
    }

    function batchRepay(
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    )
        external
        override
        nonReentrant
        returns (uint256[] memory, uint256[] memory, bool[] memory)
    {
        require(
            loanIds.length == amounts.length,
            "inconsistent amounts length"
        );

        uint256[] memory repayAmounts = new uint256[](loanIds.length);
        uint256[] memory feeAmounts = new uint256[](loanIds.length);
        bool[] memory repayAlls = new bool[](loanIds.length);

        for (uint256 i = 0; i < loanIds.length; i++) {
            (repayAmounts[i], feeAmounts[i], repayAlls[i]) = _repay(
                loanIds[i],
                amounts[i]
            );
        }

        return (repayAmounts, feeAmounts, repayAlls);
    }

    function _repay(
        uint256 loanId,
        uint256 amount
    ) internal returns (uint256, uint256, bool) {
        IShop shopFactory = _getShopFactory();
        IShopLoan loanManager = _getLoanManager();

        (
            address reserveAsset,
            uint256 borrowAmount,
            ,
            uint256 interest,
            uint256 fee
        ) = loanManager.totalDebtInReserve(loanId, 0);

        uint256 repayDebtAmount = borrowAmount + interest + fee;

        if (amount < repayDebtAmount) {
            repayDebtAmount = amount;
        }

        IERC20Upgradeable(reserveAsset).transferFrom(
            msg.sender,
            address(this),
            repayDebtAmount
        );

        bool isRepayAll = false;
        (borrowAmount, fee, isRepayAll) = shopFactory.repay(
            loanId,
            repayDebtAmount
        );

        if (isRepayAll) {
            DataTypes.LoanData memory loan = loanManager.getLoan(loanId);
            address borrower = loan.borrower;
            require(
                borrower == _msgSender(),
                "PunkGateway: caller is not borrower"
            );
            _withdrawPunk(loan.nftTokenId, borrower);
        }

        return (borrowAmount, fee, isRepayAll);
    }

    function auction(
        uint256 loanId,
        uint256 bidPrice,
        address onBehalfOf
    ) external override nonReentrant {
        _checkValidCallerAndOnBehalfOf(onBehalfOf);

        IShop shopFactory = _getShopFactory();
        IShopLoan loanManager = _getLoanManager();

        DataTypes.LoanData memory loan = loanManager.getLoan(loanId);

        IERC20Upgradeable(loan.reserveAsset).transferFrom(
            msg.sender,
            address(this),
            bidPrice
        );

        shopFactory.auction(loanId, bidPrice, onBehalfOf);
    }

    function redeem(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine
    ) external override nonReentrant returns (uint256) {
        IShop shopFactory = _getShopFactory();
        IShopLoan loanManager = _getLoanManager();

        DataTypes.LoanData memory loan = loanManager.getLoan(loanId);

        IERC20Upgradeable(loan.reserveAsset).transferFrom(
            msg.sender,
            address(this),
            (amount + bidFine)
        );

        (, uint256 repayPrincipal, uint256 interest, uint256 fee) = shopFactory
            .redeem(loanId, amount, bidFine);

        uint256 paybackAmount = (repayPrincipal + interest + fee) + bidFine;

        if ((amount + bidFine) > paybackAmount) {
            IERC20Upgradeable(loan.reserveAsset).safeTransfer(
                msg.sender,
                ((amount + bidFine) - paybackAmount)
            );
        }

        return paybackAmount;
    }

    function liquidate(
        uint256 loanId
    ) external override nonReentrant returns (uint256) {
        IShop shopFactory = _getShopFactory();
        IShopLoan loanManager = _getLoanManager();

        DataTypes.LoanData memory loan = loanManager.getLoan(loanId);
        require(
            loan.bidderAddress == _msgSender(),
            "PunkGateway: caller is not bidder"
        );

        shopFactory.liquidate(loanId);

        _withdrawPunk(loan.nftTokenId, loan.bidderAddress);

        return 0;
    }

    function borrowETH(
        uint256 shopId,
        uint256 amount,
        uint256 punkIndex,
        address onBehalfOf
    ) external override nonReentrant {
        _checkValidCallerAndOnBehalfOf(onBehalfOf);

        _depositPunk(punkIndex);

        IShop shopFactory = _getShopFactory();

        shopFactory.borrowETH(
            shopId,
            amount,
            address(wrappedPunks),
            punkIndex,
            onBehalfOf
        );

        _safeTransferETH(onBehalfOf, amount);
    }

    function batchBorrowETH(
        uint256 shopId,
        uint256[] calldata amounts,
        uint256[] calldata punkIndexs,
        address onBehalfOf
    ) external override nonReentrant {
        require(
            punkIndexs.length == amounts.length,
            "inconsistent amounts length"
        );

        _checkValidCallerAndOnBehalfOf(onBehalfOf);

        IShop shopFactory = _getShopFactory();

        for (uint256 i = 0; i < punkIndexs.length; i++) {
            _depositPunk(punkIndexs[i]);

            shopFactory.borrowETH(
                shopId,
                amounts[i],
                address(wrappedPunks),
                punkIndexs[i],
                onBehalfOf
            );

            _safeTransferETH(onBehalfOf, amounts[i]);
        }
    }

    function repayETH(
        uint256 loanId,
        uint256 amount
    ) external payable override nonReentrant returns (uint256, uint256, bool) {
        (uint256 paybackAmount, uint256 fee, bool burn) = _repayETH(
            loanId,
            amount
        );

        // refund remaining dust eth
        if (msg.value > paybackAmount) {
            _safeTransferETH(msg.sender, msg.value - paybackAmount);
        }

        return (paybackAmount, fee, burn);
    }

    function batchRepayETH(
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    )
        external
        payable
        override
        nonReentrant
        returns (uint256[] memory, uint256[] memory, bool[] memory)
    {
        require(
            loanIds.length == amounts.length,
            "inconsistent amounts length"
        );

        uint256[] memory repayAmounts = new uint256[](loanIds.length);
        uint256[] memory feeAmounts = new uint256[](loanIds.length);
        bool[] memory repayAlls = new bool[](loanIds.length);

        uint256 allRepayAmount = 0;
        for (uint256 i = 0; i < loanIds.length; i++) {
            (repayAmounts[i], feeAmounts[i], repayAlls[i]) = _repay(
                loanIds[i],
                amounts[i]
            );
            allRepayAmount += repayAmounts[i];
        }

        // refund remaining dust eth
        if (msg.value > allRepayAmount) {
            _safeTransferETH(msg.sender, msg.value - allRepayAmount);
        }

        return (repayAmounts, feeAmounts, repayAlls);
    }

    function _repayETH(
        uint256 loanId,
        uint256 amount
    ) internal returns (uint256, uint256, bool) {
        IShop shopFactory = _getShopFactory();
        IShopLoan loanManager = _getLoanManager();

        (, uint256 borrowAmount, , uint256 interest, uint256 fee) = loanManager
            .totalDebtInReserve(loanId, 0);

        uint256 repayDebtAmount = borrowAmount + interest + fee;

        if (amount < repayDebtAmount) {
            repayDebtAmount = amount;
        }

        bool isRepayAll = false;
        uint256 paybackAmount;
        (paybackAmount, fee, isRepayAll) = shopFactory.repayETH{
            value: repayDebtAmount
        }(loanId, repayDebtAmount);

        if (isRepayAll) {
            DataTypes.LoanData memory loan = loanManager.getLoan(loanId);
            address borrower = loan.borrower;
            require(
                borrower == _msgSender(),
                "PunkGateway: caller is not borrower"
            );
            _withdrawPunk(loan.nftTokenId, borrower);
        }

        return (paybackAmount, fee, isRepayAll);
    }

    function auctionETH(
        uint256 loanId,
        address onBehalfOf
    ) external payable override nonReentrant {
        _checkValidCallerAndOnBehalfOf(onBehalfOf);

        IShop shopFactory = _getShopFactory();

        shopFactory.auctionETH{value: msg.value}(loanId, onBehalfOf);
    }

    function redeemETH(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine
    ) external payable override nonReentrant returns (uint256) {
        IShop shopFactory = _getShopFactory();

        (, uint256 repayPrincipal, uint256 interest, uint256 fee) = shopFactory
            .redeemETH{value: msg.value}(loanId, amount, bidFine);

        uint256 paybackAmount = (repayPrincipal + interest + fee) + bidFine;

        if (msg.value > paybackAmount) {
            _safeTransferETH(msg.sender, msg.value - paybackAmount);
        }

        return paybackAmount;
    }

    /**
     * @dev transfer ETH to an address, revert if it fails.
     * @param to recipient of the transfer
     * @param value the amount to send
     */
    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }

    /**
     * @dev
     */
    receive() external payable {}

    /**
     * @dev Revert fallback calls
     */
    fallback() external payable {
        revert("Fallback not allowed");
    }
}

// // SPDX-License-Identifier: agpl-3.0
// pragma solidity ^0.8.4;

// import {ERC721HolderUpgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
// import {IERC721Upgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

// import {Errors} from "../libraries/helpers/Errors.sol";
// import {IWETH} from "../interfaces/IWETH.sol";
// import {IWETHGateway} from "../interfaces/IWETHGateway.sol";
// import {IConfigProvider} from "../interfaces/IConfigProvider.sol";
// import {IShop} from "../interfaces/IShop.sol";
// import {IShopLoan} from "../interfaces/IShopLoan.sol";
// import {DataTypes} from "../libraries/types/DataTypes.sol";

// import {EmergencyTokenRecoveryUpgradeable} from "./EmergencyTokenRecoveryUpgradeable.sol";

// contract WETHGateway is
//     IWETHGateway,
//     ERC721HolderUpgradeable,
//     EmergencyTokenRecoveryUpgradeable
// {
//     IConfigProvider internal _addressProvider;

//     IWETH internal WETH;

//     mapping(address => bool) internal _callerWhitelists;

//     uint256 private constant _NOT_ENTERED = 0;
//     uint256 private constant _ENTERED = 1;
//     uint256 private _status;

//     /**
//      * @dev Prevents a contract from calling itself, directly or indirectly.
//      * Calling a `nonReentrant` function from another `nonReentrant`
//      * function is not supported. It is possible to prevent this from happening
//      * by making the `nonReentrant` function external, and making it call a
//      * `private` function that does the actual work.
//      */
//     modifier nonReentrant() {
//         // On the first call to nonReentrant, _notEntered will be true
//         require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

//         // Any calls to nonReentrant after this point will fail
//         _status = _ENTERED;

//         _;

//         // By storing the original value once again, a refund is triggered (see
//         // https://eips.ethereum.org/EIPS/eip-2200)
//         _status = _NOT_ENTERED;
//     }

//     /**
//      * @dev Sets the WETH address and the LendPoolConfigProvider address. Infinite approves lend pool.
//      * @param weth Address of the Wrapped Ether contract
//      **/
//     function initialize(address addressProvider, address weth)
//         public
//         initializer
//     {
//         __ERC721Holder_init();
//         __EmergencyTokenRecovery_init();

//         _addressProvider = IConfigProvider(addressProvider);

//         WETH = IWETH(weth);

//         require(
//             address(_getShopFactory()) != address(0),
//             "shop factory is zero address"
//         );
//         WETH.approve(address(_getShopFactory()), type(uint256).max);
//     }

//     function _getShopFactory() internal view returns (IShop) {
//         return IShop(_addressProvider.shopFactory());
//     }

//     function _getLoanManager() internal view returns (IShopLoan) {
//         return IShopLoan(_addressProvider.loanManager());
//     }

//     function authorizeLendPoolNFT(address[] calldata nftAssets)
//         external
//         nonReentrant
//         onlyOwner
//     {
//         for (uint256 i = 0; i < nftAssets.length; i++) {
//             require(
//                 !IERC721Upgradeable(nftAssets[i]).isApprovedForAll(
//                     address(this),
//                     address(_getShopFactory())
//                 ),
//                 "nft is approved"
//             );
//             IERC721Upgradeable(nftAssets[i]).setApprovalForAll(
//                 address(_getShopFactory()),
//                 true
//             );
//         }
//     }

//     function authorizeCallerWhitelist(address[] calldata callers, bool flag)
//         external
//         nonReentrant
//         onlyOwner
//     {
//         for (uint256 i = 0; i < callers.length; i++) {
//             _callerWhitelists[callers[i]] = flag;
//         }
//     }

//     function isCallerInWhitelist(address caller) external view returns (bool) {
//         return _callerWhitelists[caller];
//     }

//     function _checkValidCallerAndOnBehalfOf(address onBehalfOf) internal view {
//         require(
//             (onBehalfOf == _msgSender()) ||
//                 (_callerWhitelists[_msgSender()] == true),
//             Errors.CALLER_NOT_ONBEHALFOF_OR_IN_WHITELIST
//         );
//     }

//     function borrowETH(
//         uint256 shopId,
//         uint256 amount,
//         address nftAsset,
//         uint256 nftTokenId,
//         address onBehalfOf
//     ) external override nonReentrant {
//         _checkValidCallerAndOnBehalfOf(onBehalfOf);

//         IShop shopFactory = _getShopFactory();
//         IShopLoan loanManager = _getLoanManager();

//         uint256 loanId = loanManager.getCollateralLoanId(nftAsset, nftTokenId);
//         if (loanId == 0) {
//             IERC721Upgradeable(nftAsset).safeTransferFrom(
//                 msg.sender,
//                 address(this),
//                 nftTokenId
//             );
//         }
//         shopFactory.borrow(
//             shopId,
//             address(WETH),
//             amount,
//             nftAsset,
//             nftTokenId,
//             onBehalfOf
//         );
//         WETH.withdraw(amount);
//         _safeTransferETH(onBehalfOf, amount);
//     }

//     function batchBorrowETH(
//         uint256 shopId,
//         uint256[] calldata amounts,
//         address[] calldata nftAssets,
//         uint256[] calldata nftTokenIds,
//         address onBehalfOf
//     ) external override nonReentrant {
//         require(
//             nftAssets.length == nftTokenIds.length,
//             "inconsistent tokenIds length"
//         );
//         require(
//             nftAssets.length == amounts.length,
//             "inconsistent amounts length"
//         );

//         _checkValidCallerAndOnBehalfOf(onBehalfOf);

//         IShop shopFactory = _getShopFactory();
//         IShopLoan loanManager = _getLoanManager();

//         for (uint256 i = 0; i < nftAssets.length; i++) {
//             uint256 loanId = loanManager.getCollateralLoanId(
//                 nftAssets[i],
//                 nftTokenIds[i]
//             );
//             if (loanId == 0) {
//                 IERC721Upgradeable(nftAssets[i]).safeTransferFrom(
//                     msg.sender,
//                     address(this),
//                     nftTokenIds[i]
//                 );
//             }
//             shopFactory.borrow(
//                 shopId,
//                 address(WETH),
//                 amounts[i],
//                 nftAssets[i],
//                 nftTokenIds[i],
//                 onBehalfOf
//             );

//             WETH.withdraw(amounts[i]);
//             _safeTransferETH(onBehalfOf, amounts[i]);
//         }
//     }

//     function repayETH(uint256 loanId, uint256 amount)
//         external
//         payable
//         override
//         nonReentrant
//         returns (
//             uint256,
//             uint256,
//             bool
//         )
//     {
//         (uint256 repayAmount, uint256 fee, bool repayAll) = _repayETH(
//             loanId,
//             amount,
//             0
//         );

//         // refund remaining dust eth
//         if (msg.value > repayAmount) {
//             _safeTransferETH(msg.sender, msg.value - repayAmount);
//         }

//         return (repayAmount, fee, repayAll);
//     }

//     function batchRepayETH(
//         uint256[] calldata loanIds,
//         uint256[] calldata amounts
//     )
//         external
//         payable
//         override
//         nonReentrant
//         returns (
//             uint256[] memory,
//             uint256[] memory,
//             bool[] memory
//         )
//     {
//         require(
//             loanIds.length == amounts.length,
//             "inconsistent amounts length"
//         );

//         uint256[] memory repayAmounts = new uint256[](loanIds.length);
//         uint256[] memory feeAmounts = new uint256[](loanIds.length);
//         bool[] memory repayAlls = new bool[](loanIds.length);
//         uint256 allRepayDebtAmount = 0;

//         for (uint256 i = 0; i < loanIds.length; i++) {
//             (repayAmounts[i], feeAmounts[i], repayAlls[i]) = _repayETH(
//                 loanIds[i],
//                 amounts[i],
//                 allRepayDebtAmount
//             );

//             allRepayDebtAmount += repayAmounts[i];
//         }

//         // refund remaining dust eth
//         if (msg.value > allRepayDebtAmount) {
//             _safeTransferETH(msg.sender, msg.value - allRepayDebtAmount);
//         }

//         return (repayAmounts, feeAmounts, repayAlls);
//     }

//     function _repayETH(
//         uint256 loanId,
//         uint256 amount,
//         uint256 accAmount
//     )
//         internal
//         returns (
//             uint256,
//             uint256,
//             bool
//         )
//     {
//         IShop shopFactory = _getShopFactory();
//         IShopLoan loanManager = _getLoanManager();

//         (
//             address reserveAsset,
//             uint256 borrowAmount,
//             ,
//             uint256 interest,
//             uint256 fee
//         ) = loanManager.totalDebtInReserve(loanId, 0);

//         uint256 repayDebtAmount = borrowAmount + interest + fee;
//         require(reserveAsset == address(WETH), "loan reserve not WETH");

//         if (amount < repayDebtAmount) {
//             repayDebtAmount = amount;
//         }

//         require(
//             msg.value >= (accAmount + repayDebtAmount),
//             "msg.value is less than repay amount"
//         );

//         WETH.deposit{value: repayDebtAmount}();
//         bool isRepayAll = false;
//         (borrowAmount, fee, isRepayAll) = shopFactory.repay(
//             loanId,
//             repayDebtAmount
//         );

//         return (borrowAmount, fee, isRepayAll);
//     }

//     function auctionETH(uint256 loanId, address onBehalfOf)
//         external
//         payable
//         override
//         nonReentrant
//     {
//         _checkValidCallerAndOnBehalfOf(onBehalfOf);

//         IShop shopFactory = _getShopFactory();
//         IShopLoan loanManager = _getLoanManager();

//         DataTypes.LoanData memory loan = loanManager.getLoan(loanId);
//         require(loan.reserveAsset == address(WETH), "loan reserve not WETH");

//         WETH.deposit{value: msg.value}();
//         shopFactory.auction(loanId, msg.value, onBehalfOf);
//     }

//     function redeemETH(
//         uint256 loanId,
//         uint256 amount,
//         uint256 bidFine
//     ) external payable override nonReentrant returns (uint256) {
//         IShop shopFactory = _getShopFactory();
//         IShopLoan loanManager = _getLoanManager();

//         DataTypes.LoanData memory loan = loanManager.getLoan(loanId);
//         require(loan.reserveAsset == address(WETH), "loan reserve not WETH");

//         require(
//             msg.value >= (amount + bidFine),
//             "msg.value is less than redeem amount"
//         );

//         WETH.deposit{value: msg.value}();
//         shopFactory.redeem(loanId, amount, bidFine);
//         uint256 paybackAmount = amount + bidFine;

//         // refund remaining dust eth
//         if (msg.value > paybackAmount) {
//             WETH.withdraw(msg.value - paybackAmount);
//             _safeTransferETH(msg.sender, msg.value - paybackAmount);
//         }

//         return paybackAmount;
//     }

//     function liquidateETH(uint256 loanId)
//         external
//         payable
//         override
//         nonReentrant
//         returns (uint256)
//     {
//         IShop shopFactory = _getShopFactory();
//         IShopLoan loanManager = _getLoanManager();

//         DataTypes.LoanData memory loan = loanManager.getLoan(loanId);
//         require(loan.reserveAsset == address(WETH), "loan reserve not WETH");

//         shopFactory.liquidate(loanId);

//         return 0;
//     }

//     /**
//      * @dev transfer ETH to an address, revert if it fails.
//      * @param to recipient of the transfer
//      * @param value the amount to send
//      */
//     function _safeTransferETH(address to, uint256 value) internal {
//         (bool success, ) = to.call{value: value}(new bytes(0));
//         require(success, "ETH_TRANSFER_FAILED");
//     }

//     /**
//      * @dev Get WETH address used by WETHGateway
//      */
//     function getWETHAddress() external view returns (address) {
//         return address(WETH);
//     }

//     /**
//      * @dev Only WETH contract is allowed to transfer ETH here. Prevent other addresses to send Ether to this contract.
//      */
//     receive() external payable {
//         require(msg.sender == address(WETH), "Receive not allowed");
//     }

//     /**
//      * @dev Revert fallback calls
//      */
//     fallback() external payable {
//         revert("Fallback not allowed");
//     }
// }

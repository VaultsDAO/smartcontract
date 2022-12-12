// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {IConfigProvider} from "./IConfigProvider.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";

interface IShop {
    //
    event Created(address indexed creator, uint256 id);
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
     * @param feeAmount The platform fee
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

    event ConfigurationUpdated(
        uint256 shopId,
        address reserveAddress,
        address nftAddress,
        uint256 interestRate,
        uint256 ltvRate,
        bool active
    );

    /**
     * @dev Emitted when the pause is triggered.
     */
    event Paused();

    /**
     * @dev Emitted when the pause is lifted.
     */
    event Unpaused();

    /**
     * @dev Emitted when the pause time is updated.
     */
    event PausedTimeUpdated(uint256 startTime, uint256 durationTime);

    /**
     * @dev Emitted when the state of a reserve is updated. NOTE: This event is actually declared
     * in the ReserveLogic library and emitted in the updateInterestRates() function. Since the function is internal,
     * the event will actually be fired by the LendPool contract. The event is therefore replicated here so it
     * gets added to the LendPool ABI
     * @param reserve The address of the underlying asset of the reserve
     * @param liquidityRate The new liquidity rate
     * @param variableBorrowRate The new variable borrow rate
     * @param liquidityIndex The new liquidity index
     * @param variableBorrowIndex The new variable borrow index
     **/
    event ReserveDataUpdated(
        address indexed reserve,
        uint256 liquidityRate,
        uint256 variableBorrowRate,
        uint256 liquidityIndex,
        uint256 variableBorrowIndex
    );

    /**
     * @dev Allows users to borrow a specific `amount` of the reserve underlying asset, provided that the borrower
     * already deposited enough collateral
     * - E.g. User borrows 100 USDC, receiving the 100 USDC in his wallet
     *   and lock collateral asset in contract
     * @param reserveAsset The address of the underlying asset to borrow
     * @param amount The amount to be borrowed
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token ID of the underlying NFT used as collateral
     **/
    function borrow(
        uint256 shopId,
        address reserveAsset,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address onBehalfOf
    ) external;

    function borrowETH(
        uint256 shopId,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address onBehalfOf
    ) external;

    function batchBorrow(
        uint256 shopId,
        address[] calldata assets,
        uint256[] calldata amounts,
        address[] calldata nftAssets,
        uint256[] calldata nftTokenIds,
        address onBehalfOf
    ) external;

    function batchBorrowETH(
        uint256 shopId,
        uint256[] calldata amounts,
        address[] calldata nftAssets,
        uint256[] calldata nftTokenIds,
        address onBehalfOf
    ) external;

    /**
     * @notice Repays a borrowed `amount` on a specific reserve, burning the equivalent loan owned
     * - E.g. User repays 100 USDC, burning loan and receives collateral asset
     * @param amount The amount to repay
     * @return The final amount repaid, loan is burned or not
     **/
    function repay(
        uint256 loanId,
        uint256 amount
    ) external returns (uint256, uint256, bool);

    function repayETH(
        uint256 loanId,
        uint256 amount
    ) external payable returns (uint256, uint256, bool);

    function batchRepay(
        uint256 shopId,
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    ) external returns (uint256[] memory, uint256[] memory, bool[] memory);

    function batchRepayETH(
        uint256 shopId,
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    )
        external
        payable
        returns (uint256[] memory, uint256[] memory, bool[] memory);

    /**
     * @dev Function to auction a non-healthy position collateral-wise
     * - The caller (liquidator) want to buy collateral asset of the user getting liquidated
     * @param bidPrice The bid price of the liquidator want to buy the underlying NFT
     **/

    function auction(
        uint256 loanId,
        uint256 bidPrice,
        address onBehalfOf
    ) external;

    function auctionETH(uint256 loanId, address onBehalfOf) external payable;

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
        returns (
            uint256 remainAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        );

    function redeemETH(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine
    )
        external
        payable
        returns (
            uint256 remainAmount,
            uint256 repayPrincipal,
            uint256 interest,
            uint256 fee
        );

    /**
     * @dev Function to liquidate a non-healthy position collateral-wise
     * - The caller (liquidator) buy collateral asset of the user getting liquidated, and receives
     *   the collateral asset
     **/
    function liquidate(uint256 loanId) external;

    function rebuy(
        uint256 loanId,
        uint256 rebuyAmount,
        uint256 payAmount
    ) external;

    function getReservesList() external view returns (address[] memory);

    /**
     * @dev Returns the debt data of the NFT
     * @return nftAsset the address of the NFT
     * @return nftTokenId nft token ID
     * @return reserveAsset the address of the Reserve
     * @return totalCollateral the total power of the NFT
     * @return totalDebt the total debt of the NFT
     * @return healthFactor the current health factor of the NFT
     **/
    function getNftDebtData(
        uint256 loanId
    )
        external
        view
        returns (
            address nftAsset,
            uint256 nftTokenId,
            address reserveAsset,
            uint256 totalCollateral,
            uint256 totalDebt,
            uint256 healthFactor
        );

    /**
     * @dev Returns the auction data of the NFT
     * @param loanId the loan id of the NFT
     * @return nftAsset The address of the NFT
     * @return nftTokenId The token id of the NFT
     * @return bidderAddress the highest bidder address of the loan
     * @return bidPrice the highest bid price in Reserve of the loan
     * @return bidBorrowAmount the borrow amount in Reserve of the loan
     * @return bidFine the penalty fine of the loan
     **/
    function getNftAuctionData(
        uint256 loanId
    )
        external
        view
        returns (
            address nftAsset,
            uint256 nftTokenId,
            address bidderAddress,
            uint256 bidPrice,
            uint256 bidBorrowAmount,
            uint256 bidFine
        );

    function getNftAuctionEndTime(
        uint256 loanId
    )
        external
        view
        returns (
            address nftAsset,
            uint256 nftTokenId,
            uint256 bidStartTimestamp,
            uint256 bidEndTimestamp,
            uint256 redeemEndTimestamp
        );

    function getNftLiquidatePrice(
        uint256 loanId
    ) external view returns (uint256 liquidatePrice, uint256 paybackAmount);

    function getRebuyPrice(
        uint256 loanId
    ) external view returns (uint256 rebuyPrice, uint256 payAmount);

    function getNftsList() external view returns (address[] memory);

    function setPause(bool val) external;

    function paused() external view returns (bool);

    function getConfigProvider() external view returns (IConfigProvider);

    function addReserve(address asset) external;

    function addNftCollection(
        address nftAddress,
        string memory collection,
        uint256 maxSupply
    ) external;
}

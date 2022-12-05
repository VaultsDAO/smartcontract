// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

interface IWETHGateway {
    /**
     * @dev borrow WETH, unwraps to ETH and send both the ETH and DebtTokens to msg.sender, via `approveDelegation` and onBehalf argument in `LendPool.borrow`.
     * @param shopId the amount of ETH to borrow
     * @param amount the amount of ETH to borrow
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token ID of the underlying NFT used as collateral
     * @param onBehalfOf Address of the user who will receive the loan. Should be the address of the borrower itself
     * calling the function if he wants to borrow against his own collateral, or the address of the credit delegator
     * if he has been given credit delegation allowance
     */
    function borrowETH(
        uint256 shopId,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
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
     * @dev repays a borrow on the WETH reserve, for the specified amount (or for the whole amount, if uint256(-1) is specified).
     * @param loanId The loan
     * @param amount the amount to repay, or uint256(-1) if the user wants to repay everything
     */
    function repayETH(uint256 loanId, uint256 amount)
        external
        payable
        returns (
            uint256,
            uint256,
            bool
        );

    function batchRepayETH(
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    )
        external
        payable
        returns (
            uint256[] memory,
            uint256[] memory,
            bool[] memory
        );

    /**
     * @dev auction a borrow on the WETH reserve
     * @param loanId The loan Id
     * @param onBehalfOf Address of the user who will receive the underlying NFT used as collateral.
     * Should be the address of the borrower itself calling the function if he wants to borrow against his own collateral.
     */
    function auctionETH(uint256 loanId, address onBehalfOf) external payable;

    /**
     * @dev redeems a borrow on the WETH reserve
     * @param loanId The loan Id
     * @param amount The amount to repay the debt
     * @param bidFine The amount of bid fine
     */
    function redeemETH(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine
    ) external payable returns (uint256);

    /**
     * @dev liquidates a borrow on the WETH reserve
     * @param loanId The loan Id
     */
    function liquidateETH(uint256 loanId) external payable returns (uint256);
}

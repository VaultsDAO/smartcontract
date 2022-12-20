// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

interface IPunkGateway {
    function borrow(
        uint256 shopId,
        address reserveAsset,
        uint256 amount,
        uint256 punkIndex,
        address onBehalfOf
    ) external;

    function batchBorrow(
        uint256 shopId,
        address[] calldata reserveAssets,
        uint256[] calldata amounts,
        uint256[] calldata punkIndexs,
        address onBehalfOf
    ) external;

    function repay(
        uint256 loanId,
        uint256 amount
    ) external returns (uint256, uint256, bool);

    function batchRepay(
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    ) external returns (uint256[] memory, uint256[] memory, bool[] memory);

    function auction(
        uint256 loanId,
        uint256 bidPrice,
        address onBehalfOf
    ) external;

    function redeem(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine
    ) external returns (uint256);

    function liquidate(uint256 loanId) external returns (uint256);

    function rebuy(
        uint256 loanId,
        uint256 rebuyAmount,
        uint256 payAmount
    ) external returns (uint256);

    function borrowETH(
        uint256 shopId,
        uint256 amount,
        uint256 punkIndex,
        address onBehalfOf
    ) external;

    function batchBorrowETH(
        uint256 shopId,
        uint256[] calldata amounts,
        uint256[] calldata punkIndexs,
        address onBehalfOf
    ) external;

    function repayETH(
        uint256 loanId,
        uint256 amount
    ) external payable returns (uint256, uint256, bool);

    function batchRepayETH(
        uint256[] calldata loanIds,
        uint256[] calldata amounts
    )
        external
        payable
        returns (uint256[] memory, uint256[] memory, bool[] memory);

    function auctionETH(uint256 loanId, address onBehalfOf) external payable;

    function redeemETH(
        uint256 loanId,
        uint256 amount,
        uint256 bidFine
    ) external payable returns (uint256);

    function rebuyETH(
        uint256 loanId,
        uint256 rebuyAmount
    ) external payable returns (uint256);
}

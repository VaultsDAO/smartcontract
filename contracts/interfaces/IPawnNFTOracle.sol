// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

/************
@title IPawnNFTOracle interface
@notice Interface for NFT price oracle.*/
interface IPawnNFTOracle {
    /* CAUTION: Price uint is ETH based (WEI, 18 decimals) */
    // get asset price
    function getAssetPrice(address _nftContract)
        external
        view
        returns (uint256);

    // get latest timestamp
    function getLatestTimestamp(address _nftContract)
        external
        view
        returns (uint256);


    function setAssetData(address _nftContract, uint256 _price) external;

    function setMultipleAssetsData(
        address[] calldata _nftContracts,
        uint256[] calldata _prices
    ) external;

    function setPause(address _nftContract, bool val) external;

    function setValidUpdatedTime(uint256 _twapInterval) external;
}

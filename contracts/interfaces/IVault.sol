// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IERC20Burnable} from "../libraries/openzeppelin/token/ERC20/IERC20Burnable.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IWETH} from "./IWETH.sol";

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IVault {
    //

    function getNftAssets(uint256 _index) external view returns (address);

    function getNftTokenIds(uint256 _index) external view returns (uint256);

    function nftAssetLength() external view returns (uint256);

    function creator() external view returns (address);

    function configProvider() external view returns (address);

    function totalSupply() external view returns (uint256);

    function balanceOf(address user) external view returns (uint256);

    function buyTokens(uint256 numToken) external payable;
}

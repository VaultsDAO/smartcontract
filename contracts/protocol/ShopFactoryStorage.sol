// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IConfigProvider} from "../interfaces/IConfigProvider.sol";

contract ShopFactoryStorage {
    uint256 public shopCount;
    /// shop
    mapping(uint256 => DataTypes.ShopData) public shops;
    mapping(address => uint256) public creators;
    //shopId => reserve => nft => config
    mapping(uint256 => mapping(address => mapping(address => DataTypes.ShopConfiguration)))
        public shopsConfig;

    // reserves
    address[] reserves;
    mapping(address => DataTypes.ReservesInfo) reservesInfo;

    //nfts
    address[] nfts;
    mapping(address => DataTypes.NftsInfo) nftsInfo;

    // count loan
    mapping(uint256 => DataTypes.LoanData) loans;
    //others
    bool internal _paused;
    uint256 internal constant _NOT_ENTERED = 0;
    uint256 internal constant _ENTERED = 1;
    uint256 internal _status;

    // For upgradable, add one new variable above, minus 1 at here
    uint256[47] private __gap;
}

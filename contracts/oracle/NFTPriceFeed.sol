// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPriceFeedV2 } from "./interface/IPriceFeedV2.sol";
import { BlockContext } from "../base/BlockContext.sol";

contract NFTPriceFeed is IPriceFeedV2, Ownable, BlockContext {
    using Address for address;

    address public priceFeedAdmin;
    uint256 public latestPrice = 0;

    event FeedAdminUpdated(address indexed admin);
    event SetPrice(uint256 price);

    constructor() {
        priceFeedAdmin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == priceFeedAdmin, "NFTOracle: !admin");
        _;
    }

    function setPriceFeedAdmin(address _admin) external onlyOwner {
        priceFeedAdmin = _admin;
        emit FeedAdminUpdated(_admin);
    }

    function cacheTwap(uint256 interval) external override returns (uint256) {
        return 0;
    }

    function decimals() external view override returns (uint8) {
        return 8;
    }

    function setPrice(uint256 _price) external onlyAdmin {
        latestPrice = _price;
        emit SetPrice(_price);
    }

    function getPrice(uint256 interval) external view override returns (uint256) {
        // NO_IP: invalid price
        require(latestPrice > 0, "NO_IP");
        return latestPrice;
    }
}

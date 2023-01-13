// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPriceFeedV2 } from "./interface/IPriceFeedV2.sol";
import { BlockContext } from "../base/BlockContext.sol";

contract NftPriceFeed is IPriceFeedV2, Ownable, BlockContext {
    using Address for address;

    address public priceFeedAdmin;
    string public symbol = "";
    uint256 public latestPrice = 0;

    event FeedAdminUpdated(address indexed admin);
    event PriceUpdated(uint256 price);

    constructor(string memory symbol) {
        priceFeedAdmin = msg.sender;
    }

    modifier onlyAdmin() {
        // NPF_NA: Not admin
        require(msg.sender == priceFeedAdmin, "NPF_NA");
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
        return 18;
    }

    function setPrice(uint256 _price) external onlyAdmin {
        require(_price > 0, "NPF_IP");
        latestPrice = _price;
        emit PriceUpdated(_price);
    }

    function getPrice(uint256 interval) external view override returns (uint256) {
        // NPF_IP: invalid price
        require(latestPrice > 0, "NPF_IP");
        return latestPrice;
    }
}

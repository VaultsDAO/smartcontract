// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {IERC20} from "../openzeppelin/token/ERC20/IERC20.sol";

library DataTypes {
    enum State {
        inactive,
        live,
        ended,
        redeemed
    }
    struct FragmentInitializeParams {
        address configProvider;
        address creator;
        address[] nftAssets;
        uint256[] nftTokenIds;
        uint256 salePrice;
        string name;
        string symbol;
        uint256 supply;
    }
}

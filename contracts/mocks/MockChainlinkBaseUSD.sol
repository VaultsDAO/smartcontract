// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.4;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// EACAggregatorProxy is (AggregatorProxy is AggregatorV2V3Interface)
contract MockChainlinkBaseUSD {
    uint8 public _decimals;
    AggregatorV3Interface public _aggregator;

    constructor(uint8 decimals_, AggregatorV3Interface aggregator_) {
        _decimals = decimals_;
        _aggregator = aggregator_;
    }

    // V3
    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        int256 _price;
        (roundId, _price, startedAt, updatedAt, answeredInRound) = _aggregator
            .latestRoundData();
        answer = int256(10**(_decimals + _aggregator.decimals())) / _price;
    }
}

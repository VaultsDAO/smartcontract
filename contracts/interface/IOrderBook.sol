// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { DataTypes } from "../types/DataTypes.sol";
import { OpenOrder } from "../lib/OpenOrder.sol";

interface IOrderBook {
    struct AddLiquidityParams {
        address baseToken;
        uint128 liquidity;
    }

    struct RemoveLiquidityParams {
        address baseToken;
        uint128 liquidity;
    }

    struct AddLiquidityResponse {
        uint256 base;
        uint256 quote;
        uint256 fee;
        uint128 liquidity;
        int24 lowerTick;
        int24 upperTick;
    }

    struct RemoveLiquidityResponse {
        uint256 base;
        uint256 quote;
        uint256 fee;
        int256 takerBase;
        int256 takerQuote;
        int24 lowerTick;
        int24 upperTick;
    }

    struct ReplaySwapParams {
        address baseToken;
        bool isBaseToQuote;
        bool shouldUpdateState;
        int256 amount;
        uint160 sqrtPriceLimitX96;
        uint24 uniswapFeeRatio;
        DataTypes.Growth globalFundingGrowth;
    }

    /// @param insuranceFundFee = fee * insuranceFundFeeRatio
    struct ReplaySwapResponse {
        int24 tick;
        uint256 fee;
    }

    struct MintCallbackData {
        address pool;
    }

    /// @notice Emitted when the `Exchange` contract address changed
    /// @param exchange The address of exchange contract
    event ExchangeChanged(address indexed exchange);

    /// @notice Add liquidity logic
    /// @dev Only used by `ClearingHouse` contract
    /// @param params Add liquidity params, detail on `IOrderBook.AddLiquidityParams`
    /// @return response Add liquidity response, detail on `IOrderBook.AddLiquidityResponse`
    function addLiquidity(AddLiquidityParams calldata params) external returns (AddLiquidityResponse memory response);

    /// @notice Remove liquidity logic, only used by `ClearingHouse` contract
    /// @param params Remove liquidity params, detail on `IOrderBook.RemoveLiquidityParams`
    /// @return response Remove liquidity response, detail on `IOrderBook.RemoveLiquidityResponse`
    function removeLiquidity(
        RemoveLiquidityParams calldata params
    ) external returns (RemoveLiquidityResponse memory response);

    /// @notice Replay the swap and get the swap result (price impact and swap fee),
    /// only can be called by `ClearingHouse` contract;
    /// @dev `ReplaySwapResponse.insuranceFundFee = fee * insuranceFundFeeRatio`
    /// @param params ReplaySwap params, detail on `IOrderBook.ReplaySwapParams`
    /// @return response The swap result encoded in `ReplaySwapResponse`
    function replaySwap(ReplaySwapParams memory params) external returns (ReplaySwapResponse memory response);

    /// @notice Get open order ids of a trader in the given market
    /// @param baseToken The base token address
    function getOpenOrder(address baseToken) external view returns (OpenOrder.Info memory info);

    /// @notice Check if the specified trader has order in given markets
    /// @param tokens The base token addresses
    /// @return hasOrder True if the trader has order in given markets
    function hasOrder(address[] calldata tokens) external view returns (bool hasOrder);

    /// @notice Get `Exchange` contract address
    /// @return exchange The `Exchange` contract address
    function getExchange() external view returns (address exchange);
}

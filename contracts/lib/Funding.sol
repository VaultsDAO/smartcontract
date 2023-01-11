// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { Tick } from "./Tick.sol";
import { PerpMath } from "./PerpMath.sol";
import { OpenOrder } from "./OpenOrder.sol";
import { PerpSafeCast } from "./PerpSafeCast.sol";
import { PerpFixedPoint96 } from "./PerpFixedPoint96.sol";
import { TickMath } from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import { LiquidityAmounts } from "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";

library Funding {
    using PerpSafeCast for uint256;
    using PerpSafeCast for uint128;
    using SignedSafeMathUpgradeable for int256;

    //
    // STRUCT
    //

    /// @dev tw: time-weighted
    /// @param twPremiumX96 overflow inspection (as twPremiumX96 > twPremiumDivBySqrtPriceX96):
    //         max = 2 ^ (255 - 96) = 2 ^ 159 = 7.307508187E47
    //         assume premium = 10000, time = 10 year = 60 * 60 * 24 * 365 * 10 -> twPremium = 3.1536E12
    struct Growth {
        // int256 twPremiumX96;
        // int256 twPremiumDivBySqrtPriceX96;
        int256 twLongPremiumX96;
        int256 twLongPremiumDivBySqrtPriceX96;
        int256 twShortPremiumX96;
        int256 twShortPremiumDivBySqrtPriceX96;
    }

    //
    // CONSTANT
    //

    /// @dev block-based funding is calculated as: premium * timeFraction / 1 day, for 1 day as the default period
    int256 internal constant _DEFAULT_FUNDING_PERIOD = 1 days;

    //
    // INTERNAL PURE
    //

    function calcPendingFundingPaymentWithLiquidityCoefficient(
        int256 baseBalance,
        int256 twLongPremiumGrowthGlobalX96,
        int256 twShortPremiumGrowthGlobalX96,
        Growth memory fundingGrowthGlobal
    ) internal pure returns (int256) {
        int256 balanceCoefficientInFundingPayment = 0;
        if (baseBalance > 0) {
            balanceCoefficientInFundingPayment = PerpMath.mulDiv(
                baseBalance,
                fundingGrowthGlobal.twLongPremiumX96.sub(twLongPremiumGrowthGlobalX96),
                uint256(PerpFixedPoint96._IQ96)
            );
        }
        if (baseBalance < 0) {
            balanceCoefficientInFundingPayment = PerpMath.mulDiv(
                baseBalance,
                fundingGrowthGlobal.twShortPremiumX96.sub(twShortPremiumGrowthGlobalX96),
                uint256(PerpFixedPoint96._IQ96)
            );
        }
        return balanceCoefficientInFundingPayment.div(_DEFAULT_FUNDING_PERIOD);
    }
}

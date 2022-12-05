// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {Errors} from "../helpers/Errors.sol";
import {DataTypes} from "../types/DataTypes.sol";

library ShopConfiguration {
    uint256 constant LTV_MASK =                   0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000; // prettier-ignore
    uint256 constant ACTIVE_MASK =                0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFFFFFFFF; // prettier-ignore
    uint256 constant INTEREST_RATE_MASK =         0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF; // prettier-ignore

    /// @dev For the LTV, the start bit is 0 (up to 15), hence no bitshifting is needed
    uint256 constant IS_ACTIVE_START_BIT_POSITION = 56;
    uint256 constant INTEREST_RATE_POSITION = 128;

    uint256 constant MAX_VALID_LTV = 8000;
    uint256 constant MAX_VALID_INTEREST_RATE = 65535;

    /**
     * @dev Sets the Loan to Value of the NFT
     * @param self The NFT configuration
     * @param ltv the new ltv
     **/
    function setLtv(DataTypes.ShopConfiguration memory self, uint256 ltv)
        internal
        pure
    {
        require(ltv <= MAX_VALID_LTV, Errors.RC_INVALID_LTV);

        self.data = (self.data & LTV_MASK) | ltv;
    }

    /**
     * @dev Gets the Loan to Value of the NFT
     * @param self The NFT configuration
     * @return The loan to value
     **/
    function getLtv(DataTypes.ShopConfiguration storage self)
        internal
        view
        returns (uint256)
    {
        return self.data & ~LTV_MASK;
    }

    /**
     * @dev Sets the active state of the NFT
     * @param self The NFT configuration
     * @param active The active state
     **/
    function setActive(DataTypes.ShopConfiguration memory self, bool active)
        internal
        pure
    {
        self.data =
            (self.data & ACTIVE_MASK) |
            (uint256(active ? 1 : 0) << IS_ACTIVE_START_BIT_POSITION);
    }

    /**
     * @dev Gets the active state of the NFT
     * @param self The NFT configuration
     * @return The active state
     **/
    function getActive(DataTypes.ShopConfiguration storage self)
        internal
        view
        returns (bool)
    {
        return (self.data & ~ACTIVE_MASK) != 0;
    }

    /**
     * @dev Sets the min & max threshold of the NFT
     * @param self The NFT configuration
     * @param interestRate The interestRate
     **/
    function setInterestRate(
        DataTypes.ShopConfiguration memory self,
        uint256 interestRate
    ) internal pure {
        require(
            interestRate <= MAX_VALID_INTEREST_RATE,
            Errors.RC_INVALID_INTEREST_RATE
        );

        self.data =
            (self.data & INTEREST_RATE_MASK) |
            (interestRate << INTEREST_RATE_POSITION);
    }

    /**
     * @dev Gets interate of the NFT
     * @param self The NFT configuration
     * @return The interest
     **/
    function getInterestRate(DataTypes.ShopConfiguration storage self)
        internal
        view
        returns (uint256)
    {
        return ((self.data & ~INTEREST_RATE_MASK) >> INTEREST_RATE_POSITION);
    }
}

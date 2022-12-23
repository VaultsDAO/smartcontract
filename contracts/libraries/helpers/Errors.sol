pragma solidity ^0.8.0;

/**
 * @title Errors library
 * @author Bend
 * @notice Defines the error messages emitted by the different contracts of the Bend protocol
 */
library Errors {
    //common errors
    // string public constant CALLER_NOT_OWNER = "100"; // 'The caller must be owner'
    string public constant ZERO_ADDRESS = "101"; // 'zero address'

    //vault errors
    string public constant VAULT_ = "200";
    string public constant VAULT_INSUFICIENT_AMOUNT = "201";
}

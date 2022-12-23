pragma solidity ^0.8.0;

import {InitializedProxy} from "./InitializedProxy.sol";
import {IConfigProvider} from "../../interfaces/IConfigProvider.sol";

/**
 * @title InitializedProxy
 * @author 0xkongamoto
 */
contract TokenVaultProxy is InitializedProxy {
    constructor(address _configProvider) InitializedProxy(_configProvider) {}

    /**
     * @dev Returns the current implementation address.
     */
    function _implementation()
        internal
        view
        virtual
        override
        returns (address impl)
    {
        return IConfigProvider(configProvider).getVaultImpl();
    }
}

pragma solidity ^0.8.0;

import {Proxy} from "../openzeppelin/proxy/Proxy.sol";

/**
 * @title InitializedProxy
 * @author 0xkongamoto
 */
contract InitializedProxy is Proxy {
    address public immutable configProvider;

    // ======== Constructor =========
    constructor(address _configProvider) {
        configProvider = _configProvider;
    }

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
        return configProvider;
    }
}

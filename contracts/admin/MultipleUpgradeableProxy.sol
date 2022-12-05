pragma solidity ^0.8.0;

import {Proxy} from "../openzeppelin/contracts/proxy/Proxy.sol";
import {IPawnProxyAdmin} from "./IPawnProxyAdmin.sol";

/**
 * @title InitializedProxy
 * @author 0xkongamoto
 */
contract MultipleUpgradeableProxy is Proxy {
    //
    IPawnProxyAdmin public immutable multipleProxyAdmin;
    //
    bytes32 public immutable multipleProxyKey;

    // ======== Constructor =========
    constructor(IPawnProxyAdmin _multipleProxyAdmin, bytes32 _multipleProxyKey)
    {
        multipleProxyAdmin = _multipleProxyAdmin;
        multipleProxyKey = _multipleProxyKey;
    }

    /**
     * @dev This is a virtual function that should be overridden so it returns the address to which the fallback function
     * and {_fallback} should delegate.
     */
    function _implementation()
        internal
        view
        virtual
        override
        returns (address impl)
    {
        return
            multipleProxyAdmin.getMultipleImplementation(multipleProxyKey);
    }
}

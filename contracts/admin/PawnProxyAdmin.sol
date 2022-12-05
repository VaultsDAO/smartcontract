// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {ClonesUpgradeable} from "../openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import {AddressUpgradeable} from "../openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {Address} from "../openzeppelin/contracts/utils/Address.sol";
import {ProxyAdmin} from "../openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {IMultipleUpgradeableProxy} from "./IMultipleUpgradeableProxy.sol";

contract PawnProxyAdmin is ProxyAdmin {
    //
    mapping(bytes32 => address) public multipleProxyAddresses;
    mapping(bytes32 => address) public multipleImplementationAddresses;

    event MultipleProxyImplementationCreated(
        bytes32 multipleProxyKey,
        address proxy,
        address implementation
    );

    event MultipleImplementationUpdated(
        bytes32 multipleProxyKey,
        address implementation
    );

    function createMultipleProxyImplementation(address _proxy, address _impl)
        external
        onlyOwner
    {
        require(_proxy != address(0), "_proxy zero address");
        require(_impl != address(0), "_impl zero address");
        bytes32 _proxyKey = IMultipleUpgradeableProxy(_proxy)
            .multipleProxyKey();
        multipleProxyAddresses[_proxyKey] = _proxy;
        multipleImplementationAddresses[_proxyKey] = _impl;
        emit MultipleProxyImplementationCreated(_proxyKey, _proxy, _impl);
    }

    function updateMultipleImplementation(
        bytes32 multipleProxyKey,
        address _impl
    ) external onlyOwner {
        require(_impl != address(0), "_impl zero address");
        multipleImplementationAddresses[multipleProxyKey] = _impl;
        emit MultipleImplementationUpdated(multipleProxyKey, _impl);
    }

    function getMultipleImplementation(bytes32 multipleProxyKey)
        external
        view
        returns (address)
    {
        address _impl = multipleImplementationAddresses[multipleProxyKey];
        require(_impl != address(0), "_impl zero address");
        return _impl;
    }

    function getMultipleProxy(bytes32 multipleProxyKey)
        external
        view
        returns (address)
    {
        address _impl = multipleProxyAddresses[multipleProxyKey];
        require(_impl != address(0), "_impl zero address");
        return _impl;
    }

    function createProxyAndInitWitParams(
        bytes32 multipleProxyKey,
        bytes memory initializationCalldata
    ) external returns (address) {
        address _impl = multipleProxyAddresses[multipleProxyKey];
        require(_impl != address(0), "_impl zero address");
        address proxy = ClonesUpgradeable.clone(_impl);
        if (initializationCalldata.length > 0) {
            Address.functionCall(proxy, initializationCalldata);
        }
        return proxy;
    }
}

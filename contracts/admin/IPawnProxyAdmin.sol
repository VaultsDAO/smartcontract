// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

/**
 * @author hieuq
 **/
interface IPawnProxyAdmin {
    function getMultipleImplementation(bytes32 multipleProxyKey)
        external
        view
        returns (address);

    function getMultipleProxy(bytes32 multipleProxyKey)
        external
        view
        returns (address);

    function createProxyAndInitWitParams(
        bytes32 multipleProxyKey,
        bytes memory initializationCalldata
    ) external returns (address);
}

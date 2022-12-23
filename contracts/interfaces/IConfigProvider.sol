//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IConfigProvider {
    // interface

    event AddressSet(
        bytes32 id,
        address indexed newAddress,
        bool hasProxy,
        bytes encodedCallData
    );

    function getAddress(bytes32 id) external view returns (address);

    function getText(bytes32 id) external view returns (string memory);

    function getVar(bytes32 id) external view returns (uint256);

    function getWETH() external view returns (address);

    function getFragmentBaseURI() external view returns (string memory);

    function getFragmentImpl() external view returns (address);

    function getFragmentTpl() external view returns (address);
}

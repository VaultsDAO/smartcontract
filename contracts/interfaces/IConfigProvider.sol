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
    event VarSet(bytes32 id, uint256 indexed newVal);

    function setAddress(bytes32 id, address newAddress) external;

    function getAddress(bytes32 id) external view returns (address);

    function setVar(bytes32 id, uint256 newAddress) external;

    function getVar(bytes32 id) external view returns (uint256);

    function getWETH() external view returns (address);

    function getBaseURI() external view returns (string memory);

    function setBaseURI(string memory val) external;

    function setFragmentImpl(address newAddress) external;

    function getFragmentImpl() external view returns (address);

    function setFragmentTpl(address newAddress) external;

    function getFragmentTpl() external view returns (address);
}

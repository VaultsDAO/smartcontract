//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "../libraries/openzeppelin/upgradeable/access/OwnableUpgradeable.sol";
import {IConfigProvider} from "../interfaces/IConfigProvider.sol";

contract ConfigProvider is OwnableUpgradeable, IConfigProvider {
    mapping(bytes32 => address) private _addresses;
    mapping(bytes32 => uint256) private _vars;

    string public baseURI;
    bytes32 private constant WETH = "WETH";
    bytes32 private constant FRAGMENT_TPL = "FRAGMENT_TPL";
    bytes32 private constant FRAGMENT_IMPL = "FRAGMENT_IMPL";

    //EVENT
    event FragmentTplSet(address _fragmentTpl);
    event FragmentImplSet(address _fragmentImpl);
    event BaseURISet(string _baseURI);

    constructor() {}

    function initialize() external initializer {
        __Ownable_init();
    }

    function setAddress(
        bytes32 id,
        address newAddress
    ) external override onlyOwner {
        _addresses[id] = newAddress;
        emit AddressSet(id, newAddress, false, new bytes(0));
    }

    /**
     * @dev Returns an address by id
     * @return The address
     */
    function getAddress(bytes32 id) public view override returns (address) {
        return _addresses[id];
    }

    function setVar(bytes32 id, uint256 newVal) external override onlyOwner {
        _vars[id] = newVal;
        emit VarSet(id, newVal);
    }

    function getVar(bytes32 id) public view override returns (uint256) {
        return _vars[id];
    }

    function getWETH() external view override returns (address) {
        return getAddress(WETH);
    }

    function setFragmentTpl(address _fragmentTpl) external override onlyOwner {
        require(_fragmentTpl != address(0), "cannot go to 0 address");
        _addresses[FRAGMENT_TPL] = _fragmentTpl;
        emit FragmentTplSet(_fragmentTpl);
    }

    function getFragmentTpl() external view override returns (address) {
        return getAddress(FRAGMENT_TPL);
    }

    function getBaseURI() external view returns (string memory) {
        return baseURI;
    }

    function setBaseURI(string memory val) external onlyOwner {
        baseURI = val;
        emit BaseURISet(val);
    }

    function setFragmentImpl(address _val) external override onlyOwner {
        require(_val != address(0), "cannot go to 0 address");
        _addresses[FRAGMENT_IMPL] = _val;
        emit FragmentTplSet(_val);
    }

    function getFragmentImpl() external view override returns (address) {
        return getAddress(FRAGMENT_IMPL);
    }
}

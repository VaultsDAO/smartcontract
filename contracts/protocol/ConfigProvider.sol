//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "../libraries/openzeppelin/upgradeable/access/OwnableUpgradeable.sol";
import {IConfigProvider} from "../interfaces/IConfigProvider.sol";

contract ConfigProvider is OwnableUpgradeable, IConfigProvider {
    mapping(bytes32 => address) private _addresses;
    mapping(bytes32 => uint256) private _vars;
    mapping(bytes32 => string) private _texts;

    bytes32 private constant WETH = "WETH";
    bytes32 private constant FRAGMENT_TPL = "FRAGMENT_TPL";
    bytes32 private constant FRAGMENT_IMPL = "FRAGMENT_IMPL";
    bytes32 private constant FRAGMENT_BASEURI = "FRAGMENT_BASEURI";

    //EVENT
    event FragmentTplSet(address _val);
    event FragmentImplSet(address _val);
    event FragmentBaseURISet(string _val);

    constructor() {}

    function initialize() external initializer {
        __Ownable_init();
    }

    function getAddress(bytes32 id) public view override returns (address) {
        return _addresses[id];
    }

    function getVar(bytes32 id) public view override returns (uint256) {
        return _vars[id];
    }

    function getText(bytes32 id) public view override returns (string memory) {
        return _texts[id];
    }

    function setWETH(address _val) external onlyOwner {
        require(_val != address(0), "cannot go to 0 address");
        _addresses[WETH] = _val;
        emit FragmentTplSet(_val);
    }

    function getWETH() public view override returns (address) {
        return _addresses[WETH];
    }

    function setFragmentTpl(address _val) external onlyOwner {
        require(_val != address(0), "cannot go to 0 address");
        _addresses[FRAGMENT_TPL] = _val;
        emit FragmentTplSet(_val);
    }

    function getFragmentTpl() external view override returns (address) {
        return getAddress(FRAGMENT_TPL);
    }

    function getFragmentBaseURI() external view returns (string memory) {
        return _texts[FRAGMENT_BASEURI];
    }

    function setFragmentBaseURI(string memory _val) external onlyOwner {
        _texts[FRAGMENT_BASEURI] = _val;
        emit FragmentBaseURISet(_val);
    }

    function setFragmentImpl(address _val) external onlyOwner {
        require(_val != address(0), "cannot go to 0 address");
        _addresses[FRAGMENT_IMPL] = _val;
        emit FragmentTplSet(_val);
    }

    function getFragmentImpl() external view override returns (address) {
        return getAddress(FRAGMENT_IMPL);
    }
}

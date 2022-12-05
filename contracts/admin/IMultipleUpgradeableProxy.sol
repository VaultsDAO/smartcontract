pragma solidity ^0.8.0;

import {IPawnProxyAdmin} from "./IPawnProxyAdmin.sol";
import {Proxy} from "../openzeppelin/contracts/proxy/Proxy.sol";

interface IMultipleUpgradeableProxy {
    function multipleProxyKey() external view returns (bytes32);
}

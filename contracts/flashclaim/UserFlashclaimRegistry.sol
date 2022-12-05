// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {IPawnProxyAdmin} from "../admin/IPawnProxyAdmin.sol";
import {OwnableUpgradeable} from "../openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Address} from "../openzeppelin/contracts/utils/Address.sol";

contract UserFlashclaimRegistry is OwnableUpgradeable {
    // variables
    IPawnProxyAdmin public pawnProxyAdmin;
    // @notice bnftRegistry
    address public bnftRegistry;
    /// @notice userReceivers
    mapping(address => address) public userReceivers;

    /// @notice for gap, minus 1 if use
    uint256[25] public __number;
    address[25] public __gapAddress;

    function initialize(IPawnProxyAdmin _pawnProxyAdmin, address bnftRegistry_)
        external
        initializer
    {
        __Ownable_init();
        //
        pawnProxyAdmin = _pawnProxyAdmin;
        bnftRegistry = bnftRegistry_;
    }

    function createReceiver() public {
        bytes memory _initializationCalldata = abi.encodeWithSignature(
            "initialize(address,address,uint256)",
            msg.sender,
            bnftRegistry,
            1
        );
        address receiver = pawnProxyAdmin.createProxyAndInitWitParams(
            bytes32("AIR_DROP_FLASH_LOAN_RECEIVER"),
            _initializationCalldata
        );
        userReceivers[msg.sender] = receiver;
    }
}

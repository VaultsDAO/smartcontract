//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Address} from "../libraries/openzeppelin/utils/Address.sol";
import {ClonesUpgradeable} from "../libraries/openzeppelin/upgradeable/proxy/ClonesUpgradeable.sol";
import {OwnableUpgradeable} from "../libraries/openzeppelin/upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "../libraries/openzeppelin/upgradeable/security/PausableUpgradeable.sol";
import {IERC721} from "../libraries/openzeppelin/token/ERC721/IERC721.sol";
import {IVault} from "../interfaces/IVault.sol";
import {IConfigProvider} from "../interfaces/IConfigProvider.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";

contract VaultFactory is OwnableUpgradeable, PausableUpgradeable {
    /// @notice the number of ERC721 vaults
    uint256 public vaultCount;
    address public immutable configProvider;
    /// @notice the mapping of vault number to vault contract
    mapping(uint256 => address) public vaults;

    /// @notice  gap for reserve, minus 1 if use
    uint256[10] public __gapUint256;
    /// @notice  gap for reserve, minus 1 if use
    uint256[5] public __gapAddress;

    event Mint(
        address[] tokens,
        uint256[] ids,
        uint256 price,
        address vault,
        uint256 vaultId
    );

    constructor(address _configProvider) {
        configProvider = _configProvider;
    }

    function initialize() public initializer {
        __Ownable_init();
        __Pausable_init();
        // update data
    }

    function mint(
        string memory _name,
        string memory _symbol,
        address[] memory _nftAssets,
        uint256[] memory _nftTokenIds,
        uint256 _maxSupply,
        uint256 _salePrice
    ) external whenNotPaused returns (uint256) {
        require(
            _nftAssets.length == _nftTokenIds.length,
            "invalids list tokens"
        );
        bytes memory _initializationCalldata = abi.encodeWithSignature(
            "initialize((address,address,address[],uint256[],uint256,string,string,uint256))",
            DataTypes.TokenVaultInitializeParams({
                configProvider: configProvider,
                creator: msg.sender,
                nftAssets: _nftAssets,
                nftTokenIds: _nftTokenIds,
                salePrice: _salePrice,
                name: _name,
                symbol: _symbol,
                supply: _maxSupply
            })
        );

        address vault = ClonesUpgradeable.clone(
            IConfigProvider(configProvider).getVaultTpl()
        );
        Address.functionCall(vault, _initializationCalldata);

        for (uint i = 0; i < _nftAssets.length; i++) {
            IERC721(_nftAssets[i]).safeTransferFrom(
                msg.sender,
                vault,
                _nftTokenIds[i]
            );
        }
        emit Mint(_nftAssets, _nftTokenIds, _salePrice, vault, vaultCount);

        vaultCount++;
        vaults[vaultCount] = vault;

        return vaultCount;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}

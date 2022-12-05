// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {IPawnProxyAdmin} from "../admin/IPawnProxyAdmin.sol";
import {IBNFTRegistry} from "../interfaces/IBNFTRegistry.sol";
import {IBNFT} from "../interfaces/IBNFT.sol";
import {AddressUpgradeable} from "../openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {Initializable} from "../openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "../openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC721MetadataUpgradeable} from "../openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";

contract BNFTRegistry is IBNFTRegistry, Initializable, OwnableUpgradeable {
    //
    IPawnProxyAdmin public pawnProxyAdmin;
    //
    mapping(address => address) public bNftProxys;
    address[] public bNftAssetLists;
    string public namePrefix;
    string public symbolPrefix;
    mapping(address => string) public customSymbols;
    uint256 private constant _NOT_ENTERED = 0;
    uint256 private constant _ENTERED = 1;
    uint256 private _status;
    address private _claimAdmin;

    /// @notice for gap, minus 1 if use
    uint256[25] public __number;
    address[25] public __gapAddress;

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        // On the first call to nonReentrant, _notEntered will be true
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Throws if called by any account other than the claim admin.
     */
    modifier onlyClaimAdmin() {
        require(
            claimAdmin() == _msgSender(),
            "BNFTR: caller is not the claim admin"
        );
        _;
    }

    function getBNFTAddresses(address nftAsset)
        external
        view
        override
        returns (address bNftProxy)
    {
        bNftProxy = bNftProxys[nftAsset];
    }

    function getBNFTAddressesByIndex(uint16 index)
        external
        view
        override
        returns (address bNftProxy)
    {
        require(index < bNftAssetLists.length, "BNFTR: invalid index");
        bNftProxy = bNftProxys[bNftAssetLists[index]];
    }

    function getBNFTAssetList()
        external
        view
        override
        returns (address[] memory)
    {
        return bNftAssetLists;
    }

    function allBNFTAssetLength() external view override returns (uint256) {
        return bNftAssetLists.length;
    }

    function initialize(
        address _pawnProxyAdmin,
        string memory namePrefix_,
        string memory symbolPrefix_
    ) external override initializer {
        require(
            _pawnProxyAdmin != address(0),
            "BNFTR: pawnProxyAdmin is zero address"
        );

        __Ownable_init();

        pawnProxyAdmin = IPawnProxyAdmin(_pawnProxyAdmin);

        namePrefix = namePrefix_;
        symbolPrefix = symbolPrefix_;

        _setClaimAdmin(_msgSender());

        emit Initialized(namePrefix, symbolPrefix);
    }

    /**
     * @dev See {IBNFTRegistry-createBNFT}.
     */
    function createBNFT(address nftAsset)
        external
        override
        nonReentrant
        returns (address bNftProxy)
    {
        _requireAddressIsERC721(nftAsset);

        bNftProxy = _createProxyAndInit(nftAsset);

        emit BNFTCreated(nftAsset, bNftProxy, bNftAssetLists.length);
    }

    /**
     * @dev See {IBNFTRegistry-addCustomeSymbols}.
     */
    function addCustomeSymbols(
        address[] memory nftAssets_,
        string[] memory symbols_
    ) external override nonReentrant onlyOwner {
        require(
            nftAssets_.length == symbols_.length,
            "BNFTR: inconsistent parameters"
        );

        for (uint256 i = 0; i < nftAssets_.length; i++) {
            customSymbols[nftAssets_[i]] = symbols_[i];
        }

        emit CustomeSymbolsAdded(nftAssets_, symbols_);
    }

    /**
     * @dev Returns the address of the current claim admin.
     */
    function claimAdmin() public view virtual returns (address) {
        return _claimAdmin;
    }

    /**
     * @dev Set claim admin of the contract to a new account (`newAdmin`).
     * Can only be called by the current owner.
     */
    function setClaimAdmin(address newAdmin) public virtual onlyOwner {
        require(newAdmin != address(0), "BNFTR: new admin is the zero address");
        _setClaimAdmin(newAdmin);
    }

    function _setClaimAdmin(address newAdmin) internal virtual {
        address oldAdmin = _claimAdmin;
        _claimAdmin = newAdmin;
        emit ClaimAdminUpdated(oldAdmin, newAdmin);
    }

    function _createProxyAndInit(address nftAsset)
        internal
        returns (address bNftProxy)
    {
        require(
            bNftProxys[nftAsset] == address(0),
            "BNFTR: nftAsset is created"
        );

        bytes memory _initializationCalldata = _buildInitParams(nftAsset);

        bNftProxy = pawnProxyAdmin.createProxyAndInitWitParams(
            bytes32("BNFT"),
            _initializationCalldata
        );

        bNftProxys[nftAsset] = bNftProxy;

        bNftAssetLists.push(nftAsset);
    }

    function _buildInitParams(address nftAsset)
        internal
        view
        returns (bytes memory initParams)
    {
        string memory nftSymbol = customSymbols[nftAsset];
        if (bytes(nftSymbol).length == 0) {
            nftSymbol = IERC721MetadataUpgradeable(nftAsset).symbol();
        }
        string memory bNftName = string(
            abi.encodePacked(namePrefix, " ", nftSymbol)
        );
        string memory bNftSymbol = string(
            abi.encodePacked(symbolPrefix, nftSymbol)
        );

        initParams = abi.encodeWithSelector(
            IBNFT.initialize.selector,
            nftAsset,
            bNftName,
            bNftSymbol,
            owner(),
            claimAdmin()
        );
    }

    function _requireAddressIsERC721(address nftAsset) internal view {
        require(nftAsset != address(0), "BNFTR: asset is zero address");
        require(
            AddressUpgradeable.isContract(nftAsset),
            "BNFTR: asset is not contract"
        );
    }
}

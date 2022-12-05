// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.4;

import {OwnableUpgradeable} from "../openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "../openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IPawnNFTOracle} from "../interfaces/IPawnNFTOracle.sol";
import {INFTOracle} from "../interfaces/INFTOracle.sol";
import {BlockContext} from "../utils/BlockContext.sol";

contract PawnNFTOracle is
    IPawnNFTOracle,
    Initializable,
    OwnableUpgradeable,
    BlockContext
{
    modifier onlyAdmin() {
        require(_msgSender() == priceFeedAdmin, "PawnNFTOracle: !admin");
        _;
    }

    event AssetAdded(address indexed asset);
    event AssetRemoved(address indexed asset);
    event FeedAdminUpdated(address indexed admin);
    event SetAssetData(address indexed asset, uint256 price, uint256 timestamp);

    struct NFTPriceData {
        bool registered;
        uint256 price;
        uint256 timestamp;
    }

    address public priceFeedAdmin;

    // key is nft contract address
    mapping(address => NFTPriceData) public nftPriceDataMap;
    mapping(address => INFTOracle) public nftOracleMap;
    mapping(address => address) public nftTargetMap;
    mapping(address => uint256) public nftPriceRateMap;
    address[] public nftPriceFeedKeys;

    // data validity check parameters
    uint256 public validUpdatedTime; // 3 hours

    mapping(address => bool) public nftPaused;

    modifier whenNotPaused(address _nftContract) {
        _whenNotPaused(_nftContract);
        _;
    }

    function _whenNotPaused(address _nftContract) internal view {
        bool _paused = nftPaused[_nftContract];
        require(!_paused, "PawnNFTOracle: nft price feed paused");
    }

    function initialize(address _admin, uint256 _validUpdatedTime)
        public
        initializer
    {
        __Ownable_init();
        priceFeedAdmin = _admin;
        validUpdatedTime = _validUpdatedTime;
    }

    function setPriceFeedAdmin(address _admin) external onlyOwner {
        priceFeedAdmin = _admin;
        emit FeedAdminUpdated(_admin);
    }

    function setAssets(
        address[] calldata _nftContracts,
        address[] calldata _nftOracles,
        address[] calldata _nftTargets,
        uint256[] calldata _nftPriceRates
    ) external onlyOwner {
        require(
            _nftContracts.length == _nftOracles.length,
            "_nftContracts length diff _nftOracles"
        );
        for (uint256 i = 0; i < _nftContracts.length; i++) {
            _addAsset(
                _nftContracts[i],
                INFTOracle(_nftOracles[i]),
                _nftTargets[i],
                _nftPriceRates[i]
            );
        }
    }

    function addAsset(
        address _nftContract,
        INFTOracle _nftOracle,
        address _nftTarget,
        uint256 _nftPriceRate
    ) external onlyOwner {
        _addAsset(_nftContract, _nftOracle, _nftTarget, _nftPriceRate);
    }

    function _addAsset(
        address _nftContract,
        INFTOracle _nftOracle,
        address _nftTarget,
        uint256 _nftPriceRate
    ) internal {
        requireKeyExisted(_nftContract, false);
        require(_nftPriceRate > 0, "_nftPriceRate is zero");
        require(_nftTarget != address(0), "_nftTarget is zero address");
        nftPriceDataMap[_nftContract].registered = true;
        nftOracleMap[_nftContract] = _nftOracle;
        nftTargetMap[_nftContract] = _nftTarget;
        nftPriceRateMap[_nftContract] = _nftPriceRate;
        nftPriceFeedKeys.push(_nftContract);

        emit AssetAdded(_nftContract);
    }

    function removeAsset(address _nftContract) external onlyOwner {
        requireKeyExisted(_nftContract, true);
        delete nftPriceDataMap[_nftContract];
        delete nftOracleMap[_nftContract];
        delete nftTargetMap[_nftContract];

        uint256 length = nftPriceFeedKeys.length;
        for (uint256 i = 0; i < length; i++) {
            if (nftPriceFeedKeys[i] == _nftContract) {
                nftPriceFeedKeys[i] = nftPriceFeedKeys[length - 1];
                nftPriceFeedKeys.pop();
                break;
            }
        }
        emit AssetRemoved(_nftContract);
    }

    function setAssetData(address _nftContract, uint256 _price)
        external
        override
        onlyAdmin
        whenNotPaused(_nftContract)
    {
        uint256 _timestamp = _blockTimestamp();
        _setAssetData(_nftContract, _price, _timestamp);
    }

    function setMultipleAssetsData(
        address[] calldata _nftContracts,
        uint256[] calldata _prices
    ) external override onlyAdmin {
        require(
            _nftContracts.length == _prices.length,
            "PawnNFTOracle: data length not match"
        );
        uint256 _timestamp = _blockTimestamp();
        for (uint256 i = 0; i < _nftContracts.length; i++) {
            bool _paused = nftPaused[_nftContracts[i]];
            if (!_paused) {
                _setAssetData(_nftContracts[i], _prices[i], _timestamp);
            }
        }
    }

    function _setAssetData(
        address _nftContract,
        uint256 _price,
        uint256 _timestamp
    ) internal {
        requireKeyExisted(_nftContract, true);
        require(
            _timestamp > getLatestTimestamp(_nftContract),
            "PawnNFTOracle: incorrect timestamp"
        );
        require(_price > 0, "PawnNFTOracle: price can not be 0");
        nftPriceDataMap[_nftContract].price = _price;
        nftPriceDataMap[_nftContract].timestamp = _timestamp;

        emit SetAssetData(_nftContract, _price, _timestamp);
    }

    function getAssetPrice(address _nftContract)
        external
        view
        override
        returns (uint256)
    {
        require(isExistedKey(_nftContract), "PawnNFTOracle: key not existed");
        uint256 _timestamp = _blockTimestamp();
        uint256 _latestTimestamp = getLatestTimestamp(_nftContract);
        address _nftTarget = nftTargetMap[_nftContract];
        uint256 _priceEx = nftOracleMap[_nftContract].getAssetPrice(_nftTarget);
        uint256 _nftPriceRate = nftPriceRateMap[_nftContract];
        _priceEx = (_priceEx * _nftPriceRate) / 10000;
        if (_latestTimestamp > (_timestamp - validUpdatedTime)) {
            uint256 _price = nftPriceDataMap[_nftContract].price;
            if (_price < _priceEx) {
                _priceEx = _price;
            }
        }
        return _priceEx;
    }

    function getLatestTimestamp(address _nftContract)
        public
        view
        override
        returns (uint256)
    {
        require(isExistedKey(_nftContract), "PawnNFTOracle: key not existed");
        return nftPriceDataMap[_nftContract].timestamp;
    }

    function isExistedKey(address _nftContract) private view returns (bool) {
        return nftPriceDataMap[_nftContract].registered;
    }

    function requireKeyExisted(address _key, bool _existed) private view {
        if (_existed) {
            require(isExistedKey(_key), "PawnNFTOracle: key not existed");
        } else {
            require(!isExistedKey(_key), "PawnNFTOracle: key existed");
        }
    }

    function setPause(address _nftContract, bool val)
        external
        override
        onlyOwner
    {
        nftPaused[_nftContract] = val;
    }

    function setValidUpdatedTime(uint256 _validUpdatedTime)
        external
        override
        onlyOwner
    {
        validUpdatedTime = _validUpdatedTime;
    }
}

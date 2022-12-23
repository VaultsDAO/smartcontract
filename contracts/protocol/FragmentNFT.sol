pragma solidity ^0.8.0;

import {Errors} from "../libraries/helpers/Errors.sol";
import {TransferHelper} from "../libraries/helpers/TransferHelper.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {IFragment} from "../interfaces/IFragment.sol";
import {ERC721A} from "../interfaces/ERC721A.sol";
import {IConfigProvider} from "../interfaces/IConfigProvider.sol";
import {IERC721} from "../libraries/openzeppelin/token/ERC721/IERC721.sol";
import {ERC721Upgradeable} from "../libraries/openzeppelin/upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ERC721HolderUpgradeable} from "../libraries/openzeppelin/upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import {ERC721EnumerableUpgradeable} from "../libraries/openzeppelin/upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import {IERC721ReceiverUpgradeable} from "../libraries/openzeppelin/upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import {OwnableUpgradeable} from "../libraries/openzeppelin/upgradeable/access/OwnableUpgradeable.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";

contract FragmentNFT is
    OwnableUpgradeable,
    ERC721A,
    IERC721ReceiverUpgradeable
{
    address public immutable configProvider;
    uint256 private _currentTokenId;
    /// -----------------------------------
    /// -------- TOKEN INFORMATION --------
    /// -----------------------------------

    address[] public nftAssets;
    uint256[] public nftTokenIds;
    uint256 public nftAssetLength;

    /// -----------------------------------
    /// -------- FRAGMENT INFORMATION --------
    /// -----------------------------------

    /// @notice the address who initially deposited the NFT
    address public creator;
    uint256 public maxSupply;
    uint256 public salePrice;

    /// @notice  gap for reserve, minus 1 if use
    uint256[50] public __gapUint256;
    /// @notice  gap for reserve, minus 1 if use
    uint256[50] public __gapAddress;

    event BuyTokens(
        address fragment,
        address user,
        uint256 salePrice,
        uint256 numToken
    );

    receive() external payable {}

    constructor(address _configProvider) {
        configProvider = _configProvider;
    }

    function initialize(
        DataTypes.FragmentInitializeParams memory params
    ) external initializer {
        // initialize inherited contracts
        __ERC721_init(params.name, params.symbol);
        __Ownable_init();
        // set storage variables
        require(params.salePrice > 0, "bad list price");
        require(
            params.nftAssets.length == params.nftTokenIds.length,
            "bad list length"
        );
        creator = params.creator;
        nftAssets = params.nftAssets;
        nftTokenIds = params.nftTokenIds;
        nftAssetLength = params.nftAssets.length;
        maxSupply = params.supply;
        salePrice = params.salePrice;
    }

    modifier onlyCreator() {
        require(creator == _msgSender(), "caller is not the creator");
        _;
    }

    function getNftAssets(uint256 _index) external view returns (address) {
        return nftAssets[_index];
    }

    function getNftTokenIds(uint256 _index) external view returns (uint256) {
        return nftTokenIds[_index];
    }

    function tokenURI(
        uint256 tokenId
    ) public view virtual override returns (string memory) {
        _requireMinted(tokenId);

        string memory baseURI = IConfigProvider(configProvider)
            .getFragmentBaseURI();
        return string(abi.encodePacked(baseURI, address(this), "/", tokenId));
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        operator;
        from;
        tokenId;
        data;
        return IERC721ReceiverUpgradeable.onERC721Received.selector;
    }

    function buyTokens(uint256 numToken) public payable {
        require(totalSupply() + numToken <= maxSupply);
        //validate
        require(
            msg.value >= salePrice * numToken,
            Errors.FRAGMENT_INSUFICIENT_AMOUNT
        );

        _safeMint(msg.sender, numToken);
        //transfer eth to creator
        TransferHelper.safeTransferETH(creator, salePrice * numToken);

        //return dust amount to msg.sender
        if (msg.value > salePrice * numToken) {
            uint256 dustAmount = msg.value - salePrice * numToken;
            if (dustAmount >= 10 ** 14) {
                TransferHelper.safeTransferETH(msg.sender, dustAmount);
            }
        }

        emit BuyTokens(address(this), msg.sender, salePrice, numToken);
    }

    function creatorMint(uint256 numToken) public payable onlyCreator {
        require(totalSupply() + numToken <= maxSupply);

        _safeMint(msg.sender, numToken);

        emit BuyTokens(address(this), msg.sender, salePrice, numToken);
    }
}

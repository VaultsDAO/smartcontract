pragma solidity >=0.4.22 <0.9.0;

import "../libraries/openzeppelin/utils/Strings.sol";
import "../libraries/openzeppelin/access/Ownable.sol";
import "../libraries/openzeppelin/token/ERC721/ERC721.sol";

contract MockNFT is Ownable, ERC721 {
    //
    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI
    ) public ERC721(name_, symbol_) {
        _setBaseURI(baseURI);
    }

    function mint(address user, uint256 _tokenId) public {
        _safeMint(user, _tokenId);
    }
}

pragma solidity >=0.4.22 <0.9.0;

import {ERC721} from "../libraries/openzeppelin/token/ERC721/ERC721.sol";

contract MockNFT is ERC721 {
    //
    constructor(
        string memory name_,
        string memory symbol_
    ) public ERC721(name_, symbol_) {}

    function mint(address _to, uint256 _tokenId) public {
        _safeMint(_to, _tokenId);
    }
}

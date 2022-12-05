pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockERC1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(
        address to,
        uint256 id,
        uint256 amount
    ) public virtual {
        _mint(to, id, amount, "");
    }
}

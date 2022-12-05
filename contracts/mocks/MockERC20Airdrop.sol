//SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Context.sol";

contract MockERC20Airdrop is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function claimTokens() public virtual {
        _mint(msg.sender, 12345 * (10**decimals()));
    }
}

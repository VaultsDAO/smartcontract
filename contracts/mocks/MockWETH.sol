// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2015, 2016, 2017 Dapphub
// Adapted by Ethereum Community 2021
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Wrapped Ether v10 (WETH10) is an Ether (ETH) ERC-20 wrapper. You can `deposit` ETH and obtain a WETH10 balance which can then be operated as an ERC-20 token. You can
/// `withdraw` ETH from WETH10, which will then burn WETH10 token in your wallet. The amount of WETH10 token in any wallet is always identical to the
/// balance of ETH deposited minus the ETH withdrawn with that specific wallet.
contract MockWETH is IERC20 {
    string public constant name = "Wrapped Ether v10";
    string public constant symbol = "WETH10";
    uint8 public constant decimals = 18;

    /// @dev Records amount of WETH10 token owned by account.
    mapping(address => uint256) public override balanceOf;

    /// @dev Records number of WETH10 token that account (second) will be allowed to spend on behalf of another account (first) through {transferFrom}.
    mapping(address => mapping(address => uint256)) public override allowance;

    constructor() {}

    /// @dev Returns the total supply of WETH10 token as the ETH held in this contract.
    function totalSupply() external view override returns (uint256) {
        return address(this).balance;
    }

    /// @dev Fallback, `msg.value` of ETH sent to this contract grants caller account a matching increase in WETH10 token balance.
    /// Emits {Transfer} event to reflect WETH10 token mint of `msg.value` from `address(0)` to caller account.
    receive() external payable {
        // _mintTo(msg.sender, msg.value);
        balanceOf[msg.sender] += msg.value;
        emit Transfer(address(0), msg.sender, msg.value);
    }

    /// @dev `msg.value` of ETH sent to this contract grants caller account a matching increase in WETH10 token balance.
    /// Emits {Transfer} event to reflect WETH10 token mint of `msg.value` from `address(0)` to caller account.
    function deposit() external payable {
        // _mintTo(msg.sender, msg.value);
        balanceOf[msg.sender] += msg.value;
        emit Transfer(address(0), msg.sender, msg.value);
    }

    /// @dev Burn `value` WETH10 token from caller account and withdraw matching ETH to the same.
    /// Emits {Transfer} event to reflect WETH10 token burn of `value` to `address(0)` from caller account.
    /// Requirements:
    ///   - caller account must have at least `value` balance of WETH10 token.
    function withdraw(uint256 value) external {
        // _burnFrom(msg.sender, value);
        uint256 balance = balanceOf[msg.sender];
        require(balance >= value, "WETH: burn amount exceeds balance");
        balanceOf[msg.sender] = balance - value;
        emit Transfer(msg.sender, address(0), value);

        // _transferEther(msg.sender, value);
        (bool success, ) = msg.sender.call{value: value}("");
        require(success, "WETH: ETH transfer failed");
    }

    /// @dev Sets `value` as allowance of `spender` account over caller account's WETH10 token.
    /// Emits {Approval} event.
    /// Returns boolean value indicating whether operation succeeded.
    function approve(address spender, uint256 value)
        external
        override
        returns (bool)
    {
        // _approve(msg.sender, spender, value);
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);

        return true;
    }

    /// @dev Moves `value` WETH10 token from caller's account to account (`to`).
    /// A transfer to `address(0)` triggers an ETH withdraw matching the sent WETH10 token in favor of caller.
    /// Emits {Transfer} event.
    /// Returns boolean value indicating whether operation succeeded.
    /// Requirements:
    ///   - caller account must have at least `value` WETH10 token.
    function transfer(address to, uint256 value)
        external
        override
        returns (bool)
    {
        // _transferFrom(msg.sender, to, value);
        if (to != address(0) && to != address(this)) {
            // Transfer
            uint256 balance = balanceOf[msg.sender];
            require(balance >= value, "WETH: transfer amount exceeds balance");

            balanceOf[msg.sender] = balance - value;
            balanceOf[to] += value;
            emit Transfer(msg.sender, to, value);
        } else {
            // Withdraw
            uint256 balance = balanceOf[msg.sender];
            require(balance >= value, "WETH: burn amount exceeds balance");
            balanceOf[msg.sender] = balance - value;
            emit Transfer(msg.sender, address(0), value);

            (bool success, ) = msg.sender.call{value: value}("");
            require(success, "WETH: ETH transfer failed");
        }

        return true;
    }

    /// @dev Moves `value` WETH10 token from account (`from`) to account (`to`) using allowance mechanism.
    /// `value` is then deducted from caller account's allowance, unless set to `type(uint256).max`.
    /// A transfer to `address(0)` triggers an ETH withdraw matching the sent WETH10 token in favor of caller.
    /// Emits {Approval} event to reflect reduced allowance `value` for caller account to spend from account (`from`),
    /// unless allowance is set to `type(uint256).max`
    /// Emits {Transfer} event.
    /// Returns boolean value indicating whether operation succeeded.
    /// Requirements:
    ///   - `from` account must have at least `value` balance of WETH10 token.
    ///   - `from` account must have approved caller to spend at least `value` of WETH10 token, unless `from` and caller are the same account.
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external override returns (bool) {
        if (from != msg.sender) {
            // _decreaseAllowance(from, msg.sender, value);
            uint256 allowed = allowance[from][msg.sender];
            if (allowed != type(uint256).max) {
                require(allowed >= value, "WETH: request exceeds allowance");
                uint256 reduced = allowed - value;
                allowance[from][msg.sender] = reduced;
                emit Approval(from, msg.sender, reduced);
            }
        }

        // _transferFrom(from, to, value);
        if (to != address(0) && to != address(this)) {
            // Transfer
            uint256 balance = balanceOf[from];
            require(balance >= value, "WETH: transfer amount exceeds balance");

            balanceOf[from] = balance - value;
            balanceOf[to] += value;
            emit Transfer(from, to, value);
        } else {
            // Withdraw
            uint256 balance = balanceOf[from];
            require(balance >= value, "WETH: burn amount exceeds balance");
            balanceOf[from] = balance - value;
            emit Transfer(from, address(0), value);

            (bool success, ) = msg.sender.call{value: value}("");
            require(success, "WETH: ETH transfer failed");
        }

        return true;
    }
}

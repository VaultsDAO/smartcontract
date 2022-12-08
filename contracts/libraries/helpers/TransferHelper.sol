// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import {IWETH} from "./../../interfaces/IWETH.sol";

library TransferHelper {
    //
    function safeTransferERC20(
        address token,
        address to,
        uint256 value
    ) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)'))) -> 0xa9059cbb
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(0xa9059cbb, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "safeTransferERC20: transfer failed"
        );
    }

    //
    function safeTransferETH(address weth, address to, uint256 value) internal {
        (bool success, ) = address(to).call{value: value, gas: 30000}("");
        if (!success) {
            IWETH(weth).deposit{value: value}();
            safeTransferERC20(weth, to, value);
        }
    }

    function convertETHToWETH(address weth, uint256 value) internal {
        IWETH(weth).deposit{value: value}();
    }

    // Will attempt to transfer ETH, but will transfer WETH instead if it fails.
    function transferWETH2ETH(
        address weth,
        address to,
        uint256 value
    ) internal {
        if (value > 0) {
            IWETH(weth).withdraw(value);
            safeTransferETH(weth, to, value);
        }
    }

    // convert eth to weth and transfer to toAddress
    function transferWETHFromETH(
        address weth,
        address toAddress,
        uint256 value
    ) internal {
        if (value > 0) {
            IWETH(weth).deposit{value: value}();
            safeTransferERC20(weth, toAddress, value);
        }
    }
}

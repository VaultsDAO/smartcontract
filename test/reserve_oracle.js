const TestERC20 = artifacts.require("TestERC20");
const MockNFT = artifacts.require("MockNFT");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const MockChainlinkOracle = artifacts.require("MockChainlinkOracle");
const ReserveOracle = artifacts.require("ReserveOracle");

/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */

contract("ReserveOracle", function (accounts) {

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const [pawnProxyAdminOwner, priceFeedAdmin, priceFeedAdminNew] = accounts;

  it("should assert true", async function () {
    // 
    let mockUSDCChainlinkOracle = await MockChainlinkOracle.new(18);

    let weth = await TestERC20.new('XXX', 'XXX');
    let usdc = await TestERC20.new('XXX', 'XXX');

    let reserveOracle = await ReserveOracle.new();

    let pawnProxyAdmin = await PawnProxyAdmin.new({ from: pawnProxyAdminOwner });

    const initializeData = web3.eth.abi.encodeFunctionCall(
      {
        name: 'initialize',
        type: 'function',
        inputs: [{
          type: 'address',
          name: '_weth'
        }
        ]
      },
      [weth.address]
    );

    let proxy = await TransparentUpgradeableProxy.new(
      reserveOracle.address,
      pawnProxyAdmin.address,
      initializeData,
      { from: pawnProxyAdminOwner },
    );

    proxy = await ReserveOracle.at(proxy.address)

    await proxy.addAggregator(usdc.address, mockUSDCChainlinkOracle.address);

    await mockUSDCChainlinkOracle.mockAddAnswer(1, 754485442002016, 1, 200000000000, 1);

    console.log('proxy.getAssetPrice()', (await proxy.getAssetPrice(usdc.address)).toString())

    await mockUSDCChainlinkOracle.mockAddAnswer(2, 754485442002016, 1, 200000000001, 1);

    console.log('proxy.getAssetPrice()', (await proxy.getAssetPrice(usdc.address)).toString())

    await mockUSDCChainlinkOracle.mockAddAnswer(2, 754485442002016, 1, 200000000002, 1);

    console.log('proxy.getAssetPrice()', (await proxy.getAssetPrice(usdc.address)).toString())

    return assert.isTrue(true);
  });
});

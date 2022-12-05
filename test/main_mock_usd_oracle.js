const Ishop = artifacts.require("Ishop");

const MockChainlinkBaseUSD = artifacts.require("MockChainlinkBaseUSD");


var BN = web3.utils.BN;

var utils = require('./utils.js')


/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */


contract("Factory", function (accounts) {
  const [pawnProxyAdminOwner, priceFeedAdmin, platformFeeReceiver, lender, borrower, bidder1, bidder2] = accounts;

  it("new loan", async function () {
    // setup
    let deployment = await require('./setup.js')(accounts)

    let weth = deployment.weth
    let usdc = deployment.usdc
    let testNft = deployment.testNft
    let pawnProxyAdmin = deployment.pawnProxyAdmin
    let provider = deployment.provider
    let shopFactory = deployment.shopFactory
    let shopLoan = deployment.shopLoan
    let bnft = deployment.bnft
    let bnftRegistry = deployment.bnftRegistry
    let userFlashclaimRegistry = deployment.userFlashclaimRegistry
    let mockNFTOracle = deployment.mockNFTOracle
    let nftOracle = deployment.nftOracle
    let mockUSDCChainlinkOracle = deployment.mockUSDCChainlinkOracle
    let reserveOracle = deployment.reserveOracle
    let wethGateway = deployment.wethGateway

    let mockChainlinkBaseUSD = await MockChainlinkBaseUSD.new(18, mockUSDCChainlinkOracle.address)

    let rs = await mockChainlinkBaseUSD.latestRoundData();

    console.log(rs.answer.toString())

    return assert.isTrue(true);
  });
});

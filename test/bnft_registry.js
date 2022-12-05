const TestERC20 = artifacts.require("TestERC20");
const MockNFT = artifacts.require("MockNFT");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const MultipleUpgradeableProxy = artifacts.require('MultipleUpgradeableProxy');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const BNFTRegistry = artifacts.require("BNFTRegistry");
const BNFT = artifacts.require("BNFT");

/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */

contract("BNFTRegistry", function (accounts) {

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const [pawnProxyAdminOwner, nftOwner] = accounts;

  it("should assert true", async function () {
    let pawnProxyAdmin = await PawnProxyAdmin.new({ from: pawnProxyAdminOwner });

    let bnft = await BNFT.new();
    let proxyKey = Buffer.from('BNFT');
    let bnftMultipleUpgradeableProxy = await MultipleUpgradeableProxy.new(pawnProxyAdmin.address, proxyKey)
    await pawnProxyAdmin.createMultipleProxyImplementation(bnftMultipleUpgradeableProxy.address, bnft.address)
    let bnftRegistry = await BNFTRegistry.new();
    let initializeData = bnftRegistry.contract.methods.initialize(
      pawnProxyAdmin.address,
      'BNFT',
      'B',
    ).encodeABI();
    let proxy = await TransparentUpgradeableProxy.new(
      bnftRegistry.address,
      pawnProxyAdmin.address,
      initializeData,
      { from: pawnProxyAdminOwner },
    );
    bnftRegistry = await BNFTRegistry.at(proxy.address)

    // finished deploy bnft registry

    let testERC721 = await MockNFT.new('XXX', 'XXX', '');

    await bnftRegistry.createBNFT(testERC721.address)

    let rs = await bnftRegistry.bNftProxys(testERC721.address);

    bnft = await BNFT.at(rs)

    await testERC721.mint(nftOwner, '1')

    await testERC721.setApprovalForAll(bnft.address, true, { from: nftOwner })

    await bnft.mint(nftOwner, '1', { from: nftOwner })

    console.log(nftOwner, (await bnft.ownerOf('1')).toString())

    return assert.isTrue(true);
  });
});

const TestERC20 = artifacts.require("TestERC20");
const MockNFT = artifacts.require("MockNFT");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const PawnNFTOracle = artifacts.require("PawnNFTOracle");
const MockNFTOracle = artifacts.require("MockNFTOracle");

/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */

contract("MockNFTOracle", function (accounts) {

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function evmMine() {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_mine",
        id: new Date().getTime()
      }, (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      });
    });
  };

  const [pawnProxyAdminOwner, priceFeedAdmin, priceFeedAdminNew] = accounts;

  it("should assert true", async function () {

    let pawnProxyAdmin = await PawnProxyAdmin.new({ from: pawnProxyAdminOwner });


    let mockNFTOracle = await MockNFTOracle.new();
    let initializeData = mockNFTOracle.contract.methods.initialize(
      priceFeedAdmin,
      web3.utils.toWei('0.2', 'ether'), // _maxPriceDeviation 20%
      web3.utils.toWei('0.1', 'ether'), // _maxPriceDeviationWithTime 10%
      // 30 * 60,// 30 minutes
      1,
      // 10*60,//_minUpdateTime 10 minutes
      1,//_minUpdateTime
      // 10 * 60 // _twapInterval 10 minutes
      1,//_minUpdateTime
    ).encodeABI();
    mockNFTOracle = await TransparentUpgradeableProxy.new(
      mockNFTOracle.address,
      pawnProxyAdmin.address,
      initializeData,
      { from: pawnProxyAdminOwner },
    );
    mockNFTOracle = await MockNFTOracle.at(mockNFTOracle.address)

    // nftOracle

    let nftOracle = await PawnNFTOracle.new();
    initializeData = nftOracle.contract.methods.initialize(
      priceFeedAdmin,
      // 10 * 60 // _twapInterval 10 minutes
      30,//_minUpdateTime
    ).encodeABI();

    nftOracle = await TransparentUpgradeableProxy.new(
      nftOracle.address,
      pawnProxyAdmin.address,
      initializeData,
      { from: pawnProxyAdminOwner },
    );

    nftOracle = await PawnNFTOracle.at(nftOracle.address)


    // let rs = await mockNFTOracle.priceFeedAdmin();
    // console.log('mockNFTOracle.priceFeedAdmin()', rs.toString(), priceFeedAdmin)

    // await mockNFTOracle.setPriceFeedAdmin(priceFeedAdminNew, { from: pawnProxyAdminOwner });
    // rs = await mockNFTOracle.priceFeedAdmin();
    // console.log('mockNFTOracle.priceFeedAdmin()', rs.toString(), priceFeedAdminNew)

    // mockNFTOracle = await MockNFTOracle.new();

    // await pawnProxyAdmin.upgrade(mockNFTOracle.address, mockNFTOracle.address)

    // rs = await mockNFTOracle.priceFeedAdmin();
    // console.log('mockNFTOracle.priceFeedAdmin()', rs.toString(), priceFeedAdminNew)

    let testERC721 = await MockNFT.new('XXX', 'XXX', '');

    await mockNFTOracle.addAsset(testERC721.address, { from: pawnProxyAdminOwner });
    await nftOracle.addAsset(testERC721.address, mockNFTOracle.address, { from: pawnProxyAdminOwner });

    await sleep(2000)
    
    await mockNFTOracle.setAssetData(testERC721.address, web3.utils.toWei('1', 'ether'), { from: priceFeedAdmin });
    console.log('nftOracle.getAssetPrice()', (await nftOracle.getAssetPrice(testERC721.address)).toString())

    await sleep(2000)
    await evmMine()

    await mockNFTOracle.setAssetData(testERC721.address, web3.utils.toWei('1.1', 'ether'), { from: priceFeedAdmin });
    console.log('nftOracle.getAssetPrice()', (await nftOracle.getAssetPrice(testERC721.address)).toString())

    await sleep(2000)
    await evmMine()

    await mockNFTOracle.setAssetData(testERC721.address, web3.utils.toWei('1.2', 'ether'), { from: priceFeedAdmin });
    console.log('nftOracle.getAssetPrice()', (await nftOracle.getAssetPrice(testERC721.address)).toString())

    await sleep(2000)
    await evmMine()

    await nftOracle.setAssetData(testERC721.address, web3.utils.toWei('1.5', 'ether'), { from: priceFeedAdmin });
    console.log('nftOracle.getAssetPrice()', (await nftOracle.getAssetPrice(testERC721.address)).toString())

    return assert.isTrue(true);
  });
});

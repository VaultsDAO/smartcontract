const TestERC20 = artifacts.require("TestERC20");
const MockNFT = artifacts.require("MockNFT");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const MultipleUpgradeableProxy = artifacts.require('MultipleUpgradeableProxy');
const BNFTRegistry = artifacts.require('BNFTRegistry');
const BNFT = artifacts.require('BNFT');
const UserFlashclaimRegistry = artifacts.require("UserFlashclaimRegistry");
const AirdropFlashLoanReceiver = artifacts.require("AirdropFlashLoanReceiver");

var BN = web3.utils.BN;


/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */

contract("UserFlashclaimRegistry", function (accounts) {

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const [pawnProxyAdminOwner] = accounts;

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
    // config impl
    {
      let receiverKey = Buffer.from('AIR_DROP_FLASH_LOAN_RECEIVER');
      let receiverMultipleUpgradeableProxy = await MultipleUpgradeableProxy.new(pawnProxyAdmin.address, receiverKey)
      let airdropFlashLoanReceiver = await AirdropFlashLoanReceiver.new();
      await pawnProxyAdmin.createMultipleProxyImplementation(receiverMultipleUpgradeableProxy.address, airdropFlashLoanReceiver.address)
    }
    let userFlashclaimRegistry = await UserFlashclaimRegistry.new()
    {
      initializeData = userFlashclaimRegistry.contract.methods.initialize(
        pawnProxyAdmin.address,
        bnftRegistry.address,
      ).encodeABI();

      proxy = await TransparentUpgradeableProxy.new(
        userFlashclaimRegistry.address,
        pawnProxyAdmin.address,
        initializeData,
        { from: pawnProxyAdminOwner },
      );
      userFlashclaimRegistry = await UserFlashclaimRegistry.at(proxy.address)
    }

    await userFlashclaimRegistry.createReceiver()

    let userReceiver = await userFlashclaimRegistry.userReceivers(accounts[0])

    userReceiver = await AirdropFlashLoanReceiver.at(userReceiver);

    console.log(await userReceiver.bnftRegistry(), bnftRegistry.address)

    return assert.isTrue(true);
  });
});

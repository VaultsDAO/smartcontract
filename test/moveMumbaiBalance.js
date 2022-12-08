const MockUSDC = artifacts.require("MockUSDC");
const MockWETH = artifacts.require("MockWETH");
const MockNFT = artifacts.require("MockNFT");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const ConfigProvider = artifacts.require("ConfigProvider");
const ShopFactory = artifacts.require("ShopFactory");
const MockChainlinkOracle = artifacts.require("MockChainlinkOracle");
const ReserveOracle = artifacts.require("ReserveOracle");
const NFTOracle = artifacts.require("NFTOracle");
const BNFTRegistry = artifacts.require("BNFTRegistry");
const BNFT = artifacts.require("BNFT");
const AirdropFlashLoanReceiver = artifacts.require("AirdropFlashLoanReceiver");
const UserFlashclaimRegistry = artifacts.require("UserFlashclaimRegistry");
const ShopLoan = artifacts.require("ShopLoan");



const BorrowLogic = artifacts.require("BorrowLogic");
const GenericLogic = artifacts.require("GenericLogic");
const LiquidateLogic = artifacts.require("LiquidateLogic");
const ValidationLogic = artifacts.require("ValidationLogic");

var BN = web3.utils.BN;

/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */

contract("Factory", function (accounts) {
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  it("move balance", async function () {
    let rs = await web3.eth.sendTransaction({ from: accounts[1], to: accounts[0], value: web3.utils.toWei('0.19999') })
    console.log(rs)

    await web3.eth.sendTransaction({ from: accounts[1], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[2], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[3], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[4], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[5], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[6], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[7], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[8], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[9], to: accounts[0], value: web3.utils.toWei('0.1999') })
    await web3.eth.sendTransaction({ from: accounts[10], to: accounts[0], value: web3.utils.toWei('0.1999') })
    return assert.isTrue(true);
  });
});

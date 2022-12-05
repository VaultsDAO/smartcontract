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

const WETHGateway = artifacts.require("WETHGateway");

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
  async function waitAndEvmMine(ms) {
    await sleep(ms)
    await evmMine();
  }

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

  function getResultFromLog(decoder, rawLogs, event) {
    let logs = decoder.decodeLogs(rawLogs)
    for (let i = 0; i < logs.length; i++) {
      let log = logs[i]
      if (log.event == event) {
        return log.args
      }
    }
    return ''
  }

  function getResultFromLogs(decoder, rawLogs, event) {
    let rs = []
    let logs = decoder.decodeLogs(rawLogs)
    for (let i = 0; i < logs.length; i++) {
      let log = logs[i]
      if (log.event == event) {
        rs.push(log.args)
      }
    }
    return rs
  }

  async function verifyOwnerNft(nftAddress, tokenId, owner) {
    //verify owner nft
    let currentOwner = await nftAddress.ownerOf(tokenId)
    return currentOwner.toString() == owner.toString()
  }


  async function verifyBalance(token, user, beforeBalance, added, taken) {
    let currentBalance = await token.balanceOf(user)
    console.log(new BN(beforeBalance).add(new BN(added)).sub(new BN(taken)))
    console.log(currentBalance)
    return new BN(beforeBalance).add(new BN(added)).sub(new BN(taken)) == currentBalance;
  }

  async function verifyLoanState(shopLoan, loanId, state) {
    let rs = await shopLoan.getLoan(loanId)
    return rs.state == state
  }


  const [pawnProxyAdminOwner, priceFeedAdmin, lender, borrower, bidder1, bidder2] = accounts;

  it("new loan", async function () {
    // data
    let a = [1, 2, 3, 4]
    for (var i = 0; i < a.length; i++) {
      console.log(a[i]);
    }
    return assert.isTrue(true);
  });
});

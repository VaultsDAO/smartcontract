const fs = require('fs');
const verifyContract = require('./verify_contract.js');

const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const MultipleUpgradeableProxy = artifacts.require('MultipleUpgradeableProxy');
const ConfigProvider = artifacts.require("ConfigProvider");
const ReserveOracle = artifacts.require("ReserveOracle");
const BNFTRegistry = artifacts.require("BNFTRegistry");
const BNFT = artifacts.require("BNFT");
const AirdropFlashLoanReceiver = artifacts.require("AirdropFlashLoanReceiver");
const UserFlashclaimRegistry = artifacts.require("UserFlashclaimRegistry");
const ShopFactory = artifacts.require("ShopFactory");
const ShopLoan = artifacts.require("ShopLoan");
const PawnNFTOracle = artifacts.require("PawnNFTOracle");

module.exports = async function (deployer, network) {
  let options = deployer.options.networks[network]
  if (options.migration) {
    // 
    let fileName = process.cwd() + '/migrations/deployed_' + network + '.json';
    let deployData = {}
    if (!(await fs.existsSync(fileName))) {
      throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 
    let pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    let configProvider = await ConfigProvider.at(deployData['ConfigProviderProxy']);
    let bnftRegistry = await BNFTRegistry.at(deployData['BNFTRegistryProxy']);
    let userFlashclaimRegistry = await UserFlashclaimRegistry.at(deployData['UserFlashclaimRegistryProxy']);
    let shopFactory = await ShopFactory.at(deployData['ShopFactoryProxy']);
    let shopLoan = await ShopLoan.at(deployData['ShopLoanProxy']);
    let nftOracle = await PawnNFTOracle.at(deployData['PawnNFTOracleProxy']);
    let reserveOracle = await ReserveOracle.at(deployData['ReserveOracleProxy']);
    let airdropFlashLoanReceiver = await AirdropFlashLoanReceiver.at(deployData['AirdropFlashLoanReceiver']);
    let airdropFlashLoanReceiverMultipleUpgradeableProxy = await MultipleUpgradeableProxy.at(deployData['AirdropFlashLoanReceiverMultipleUpgradeableProxy']);
    let bnft = await BNFT.at(deployData['BNFT']);
    let bnftMultipleUpgradeableProxy = await MultipleUpgradeableProxy.at(deployData['BNFTMultipleUpgradeableProxy']);

    let receiverKey = await airdropFlashLoanReceiverMultipleUpgradeableProxy.multipleProxyKey();
    if ((await pawnProxyAdmin.multipleProxyAddresses(receiverKey)) == '0x0000000000000000000000000000000000000000') {
      await pawnProxyAdmin.createMultipleProxyImplementation(airdropFlashLoanReceiverMultipleUpgradeableProxy.address, airdropFlashLoanReceiver.address)
      console.log('pawnProxyAdmin.createMultipleProxyImplementation', airdropFlashLoanReceiverMultipleUpgradeableProxy.address, airdropFlashLoanReceiver.address)
    } else {
      if ((await pawnProxyAdmin.getMultipleImplementation(receiverKey)) != airdropFlashLoanReceiver.address) {
        await pawnProxyAdmin.updateMultipleImplementation(receiverKey, airdropFlashLoanReceiver.address)
        console.log('pawnProxyAdmin.updateMultipleImplementation', receiverKey, airdropFlashLoanReceiver.address)
      }
    }
    let bnftKey = await bnftMultipleUpgradeableProxy.multipleProxyKey();
    if ((await pawnProxyAdmin.multipleProxyAddresses(bnftKey)) == '0x0000000000000000000000000000000000000000') {
      await pawnProxyAdmin.createMultipleProxyImplementation(bnftMultipleUpgradeableProxy.address, bnft.address)
      console.log('pawnProxyAdmin.createMultipleProxyImplementation', bnftMultipleUpgradeableProxy.address, bnft.address)
    } else {
      if ((await pawnProxyAdmin.getMultipleImplementation(bnftKey)) != bnft.address) {
        await pawnProxyAdmin.updateMultipleImplementation(bnftKey, bnft.address)
        console.log('pawnProxyAdmin.updateMultipleImplementation', bnftKey, bnft.address)
      }
    }
    if ((await configProvider.bnftRegistry()) != bnftRegistry.address) {
      await configProvider.setBnftRegistry(bnftRegistry.address)
      console.log('configProvider.setBnftRegistry', bnftRegistry.address)
    }
    if ((await configProvider.userClaimRegistry()) != userFlashclaimRegistry.address) {
      await configProvider.setUserClaimRegistry(userFlashclaimRegistry.address)
      console.log('configProvider.setUserClaimRegistry', userFlashclaimRegistry.address)
    }
    if ((await configProvider.nftOracle()) != nftOracle.address) {
      await configProvider.setNftOracle(nftOracle.address)
      console.log('configProvider.setNftOracle', nftOracle.address)
    }
    if ((await configProvider.reserveOracle()) != reserveOracle.address) {
      await configProvider.setReserveOracle(reserveOracle.address)
      console.log('configProvider.setReserveOracle', reserveOracle.address)
    }
    if ((await configProvider.shopFactory()) != shopFactory.address) {
      await configProvider.setShopFactory(shopFactory.address)
      console.log('configProvider.setShopFactory', shopFactory.address)
    }
    if ((await configProvider.loanManager()) != shopLoan.address) {
      await configProvider.setLoanManager(shopLoan.address)
      console.log('configProvider.setLoanManager', shopLoan.address)
    }
  }
};

const fs = require('fs');

const verifyContract = require('./verify_contract.js');
const upgradeContract = require('./upgrade_contract.js');

const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const MultipleUpgradeableProxy = artifacts.require('MultipleUpgradeableProxy');
const BNFTRegistry = artifacts.require("BNFTRegistry");
const AirdropFlashLoanReceiver = artifacts.require("AirdropFlashLoanReceiver");
const UserFlashclaimRegistry = artifacts.require("UserFlashclaimRegistry");

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
    // pawnProxyAdmin
    let pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    // bnftRegistry
    let bnftRegistry = await BNFTRegistry.at(deployData['BNFTRegistryProxy']);
    // 
    // AirdropFlashLoanReceiver
    let airdropFlashLoanReceiver;
    {
      if (deployData['AirdropFlashLoanReceiver'] == undefined || deployData['AirdropFlashLoanReceiver'] == '') {
        await deployer.deploy(AirdropFlashLoanReceiver);
        airdropFlashLoanReceiver = await AirdropFlashLoanReceiver.deployed();
        {
          deployData['AirdropFlashLoanReceiver'] = airdropFlashLoanReceiver.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        airdropFlashLoanReceiver = await AirdropFlashLoanReceiver.at(deployData['AirdropFlashLoanReceiver']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'AirdropFlashLoanReceiver',
      deployData['AirdropFlashLoanReceiver'],
      '',
    )
    // 
    let airdropFlashLoanReceiverMultipleUpgradeableProxy;
    let receiverKey = Buffer.from('AIR_DROP_FLASH_LOAN_RECEIVER');
    {
      if (deployData['AirdropFlashLoanReceiverMultipleUpgradeableProxy'] == undefined || deployData['AirdropFlashLoanReceiverMultipleUpgradeableProxy'] == '') {
        await deployer.deploy(MultipleUpgradeableProxy, pawnProxyAdmin.address, receiverKey);
        airdropFlashLoanReceiverMultipleUpgradeableProxy = await MultipleUpgradeableProxy.deployed();
        {
          deployData['AirdropFlashLoanReceiverMultipleUpgradeableProxy'] = airdropFlashLoanReceiverMultipleUpgradeableProxy.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        airdropFlashLoanReceiverMultipleUpgradeableProxy = await MultipleUpgradeableProxy.at(deployData['AirdropFlashLoanReceiverMultipleUpgradeableProxy']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'MultipleUpgradeableProxy',
      deployData['AirdropFlashLoanReceiverMultipleUpgradeableProxy'],
      '',
    )
    // 
    let userFlashclaimRegistry;
    {
      if (deployData['UserFlashclaimRegistry'] == undefined || deployData['UserFlashclaimRegistry'] == '') {
        await deployer.deploy(UserFlashclaimRegistry);
        userFlashclaimRegistry = await UserFlashclaimRegistry.deployed();
        {
          deployData['UserFlashclaimRegistry'] = userFlashclaimRegistry.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        userFlashclaimRegistry = await UserFlashclaimRegistry.at(deployData['UserFlashclaimRegistry']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'UserFlashclaimRegistry',
      deployData['UserFlashclaimRegistry'],
      '',
    )
    if (deployData['UserFlashclaimRegistryProxy'] == undefined || deployData['UserFlashclaimRegistryProxy'] == '') {
      let initializeData = userFlashclaimRegistry.contract.methods.initialize(
        pawnProxyAdmin.address,
        bnftRegistry.address,
      ).encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        userFlashclaimRegistry.address,
        pawnProxyAdmin.address,
        initializeData
      );
      userFlashclaimRegistry = await TransparentUpgradeableProxy.deployed();
      {
        deployData['UserFlashclaimRegistryProxy'] = userFlashclaimRegistry.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    await verifyContract(
      deployData,
      config,
      'UserFlashclaimRegistry',
      deployData['UserFlashclaimRegistryProxy'],
      'TransparentUpgradeableProxy',
    )
    // 
    await upgradeContract(pawnProxyAdmin, deployData['UserFlashclaimRegistryProxy'], deployData['UserFlashclaimRegistry']);
  }
};

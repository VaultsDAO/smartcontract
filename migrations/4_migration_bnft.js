const fs = require('fs');

const verifyContract = require('./verify_contract.js');
const upgradeContract = require('./upgrade_contract.js');

const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const MultipleUpgradeableProxy = artifacts.require('MultipleUpgradeableProxy');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const ConfigProvider = artifacts.require("ConfigProvider");
const BNFTRegistry = artifacts.require("BNFTRegistry");
const BNFT = artifacts.require("BNFT");

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
    // pawnProxyAdmin
    let pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    // configProvider
    configProvider = await ConfigProvider.at(deployData['ConfigProviderProxy']);
    // 
    // bnft
    let bnft;
    {
      if (deployData['BNFT'] == undefined || deployData['BNFT'] == '') {
        await deployer.deploy(BNFT);
        bnft = await BNFT.deployed();
        {
          deployData['BNFT'] = bnft.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        bnft = await BNFT.at(deployData['BNFT']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'BNFT',
      deployData['BNFT'],
      '',
    )
    // 
    let bnftMultipleUpgradeableProxy;
    let proxyKey = Buffer.from('BNFT');
    {
      if (deployData['BNFTMultipleUpgradeableProxy'] == undefined || deployData['BNFTMultipleUpgradeableProxy'] == '') {
        await deployer.deploy(MultipleUpgradeableProxy, pawnProxyAdmin.address, proxyKey);
        bnftMultipleUpgradeableProxy = await MultipleUpgradeableProxy.deployed();
        {
          deployData['BNFTMultipleUpgradeableProxy'] = bnftMultipleUpgradeableProxy.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        bnftMultipleUpgradeableProxy = await MultipleUpgradeableProxy.at(deployData['BNFTMultipleUpgradeableProxy']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'MultipleUpgradeableProxy',
      deployData['BNFTMultipleUpgradeableProxy'],
      '',
    )
    // bnftRegistry
    let bnftRegistry;
    {
      if (deployData['BNFTRegistry'] == undefined || deployData['BNFTRegistry'] == '') {
        await deployer.deploy(BNFTRegistry);
        bnftRegistry = await BNFTRegistry.deployed();
        {
          deployData['BNFTRegistry'] = bnftRegistry.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        bnftRegistry = await BNFTRegistry.at(deployData['BNFTRegistry']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'BNFTRegistry',
      deployData['BNFTRegistry'],
      '',
    )
    // BNFTRegistryProxy
    if (deployData['BNFTRegistryProxy'] == undefined || deployData['BNFTRegistryProxy'] == '') {
      initializeData = bnftRegistry.contract.methods.initialize(
        pawnProxyAdmin.address,
        'BNFT',
        'B',
      ).encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        bnftRegistry.address,
        pawnProxyAdmin.address,
        initializeData
      );
      bnftRegistry = await TransparentUpgradeableProxy.deployed();
      {
        deployData['BNFTRegistryProxy'] = bnftRegistry.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    await verifyContract(
      deployData,
      config,
      'BNFTRegistry',
      deployData['BNFTRegistryProxy'],
      'TransparentUpgradeableProxy',
    )
    // 
    await upgradeContract(pawnProxyAdmin, deployData['BNFTRegistryProxy'], deployData['BNFTRegistry']);
  }
};

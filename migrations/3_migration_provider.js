const fs = require('fs');

const verifyContract = require('./verify_contract.js');
const upgradeContract = require('./upgrade_contract.js');

const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const ConfigProvider = artifacts.require("ConfigProvider");

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
    // for WETH
    // priceFeedAdmin
    // pawnProxyAdmin
    let pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    // address provider
    let configProvider;
    {
      if (deployData['ConfigProvider'] == undefined || deployData['ConfigProvider'] == '') {
        await deployer.deploy(ConfigProvider);
        configProvider = await ConfigProvider.deployed();
        {
          deployData['ConfigProvider'] = configProvider.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        configProvider = await ConfigProvider.at(deployData['ConfigProvider']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'ConfigProvider',
      deployData['ConfigProvider'],
      '',
    )
    // 
    if (deployData['ConfigProviderProxy'] == undefined || deployData['ConfigProviderProxy'] == '') {
      let initializeData = configProvider.contract.methods.initialize().encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        configProvider.address,
        pawnProxyAdmin.address,
        initializeData
      );
      configProvider = await TransparentUpgradeableProxy.deployed();
      {
        deployData['ConfigProviderProxy'] = configProvider.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    await verifyContract(
      deployData,
      config,
      'ConfigProvider',
      deployData['ConfigProviderProxy'],
      'TransparentUpgradeableProxy',
    )
    // 
    await upgradeContract(pawnProxyAdmin, deployData['ConfigProviderProxy'], deployData['ConfigProvider']);
  }
};

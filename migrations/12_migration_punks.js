const fs = require('fs');

const verifyContract = require('./verify_contract.js');
const upgradeContract = require('./upgrade_contract.js');

const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const ConfigProvider = artifacts.require("ConfigProvider");
const PunkGateway = artifacts.require("PunkGateway");

const CryptoPunksMarket = artifacts.require("CryptoPunksMarket");
const WrappedPunk = artifacts.require("WrappedPunk");

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
    // configProvider
    let configProvider = await ConfigProvider.at(deployData['ConfigProviderProxy']);
    // 
    let punkGateway;
    {
      if (deployData['PunkGateway'] == undefined || deployData['PunkGateway'] == '') {
        await deployer.deploy(PunkGateway);
        punkGateway = await PunkGateway.deployed();
        {
          deployData['PunkGateway'] = punkGateway.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        punkGateway = await PunkGateway.at(deployData['PunkGateway']);
      }
    }
    // PunkGatewayProxy
    if (deployData['PunkGatewayProxy'] == undefined || deployData['PunkGatewayProxy'] == '') {
      let cryptoPunksMarket = await CryptoPunksMarket.at(deployData['CryptoPunksMarket']);
      let wrappedPunk = await WrappedPunk.at(deployData['WrappedPunk']);
      let initializeData = punkGateway.contract.methods.initialize(configProvider.address, cryptoPunksMarket.address, wrappedPunk.address).encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        punkGateway.address,
        pawnProxyAdmin.address,
        initializeData
      );
      punkGateway = await TransparentUpgradeableProxy.deployed();
      {
        deployData['PunkGatewayProxy'] = punkGateway.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    // 
    await upgradeContract(pawnProxyAdmin, deployData['PunkGatewayProxy'], deployData['PunkGateway']);
    // 
    await upgradeContract(pawnProxyAdmin, deployData['ShopFactoryProxy'], deployData['ShopFactory']);
    // 
    await verifyContract(
      deployData,
      config,
      'PunkGateway',
      deployData['PunkGateway'],
      '',
    )
    await verifyContract(
      deployData,
      config,
      'PunkGateway',
      deployData['PunkGatewayProxy'],
      'TransparentUpgradeableProxy',
    )
  }
};

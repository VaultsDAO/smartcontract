const fs = require('fs');

const verifyContract = require('./verify_contract.js');
const upgradeContract = require('./upgrade_contract.js');

const IWETH = artifacts.require("IWETH");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const ConfigProvider = artifacts.require("ConfigProvider");
const WETHGateway = artifacts.require("WETHGateway");

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
    let weth = await IWETH.at(deployData['WETH'])
    // pawnProxyAdmin
    let pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    let configProvider = await ConfigProvider.at(deployData['ConfigProviderProxy']);
    // WETHGateway
    let wethGateway;
    {
      if (deployData['WETHGateway'] == undefined || deployData['WETHGateway'] == '') {
        await deployer.deploy(WETHGateway);
        wethGateway = await WETHGateway.deployed();
        {
          deployData['WETHGateway'] = wethGateway.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        wethGateway = await WETHGateway.at(deployData['WETHGateway']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'WETHGateway',
      deployData['WETHGateway'],
      '',
    )
    // WETHGatewayProxy
    if (deployData['WETHGatewayProxy'] == undefined || deployData['WETHGatewayProxy'] == '') {
      let initializeData = wethGateway.contract.methods.initialize(configProvider.address, weth.address,).encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        wethGateway.address,
        pawnProxyAdmin.address,
        initializeData
      );
      wethGateway = await TransparentUpgradeableProxy.deployed();
      {
        deployData['WETHGatewayProxy'] = wethGateway.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    await verifyContract(
      deployData,
      config,
      'WETHGateway',
      deployData['WETHGatewayProxy'],
      'TransparentUpgradeableProxy',
    )
    // 
    await upgradeContract(pawnProxyAdmin, deployData['WETHGatewayProxy'], deployData['WETHGateway']);
  }
};

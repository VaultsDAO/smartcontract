const fs = require('fs');

const verifyContract = require('./verify_contract.js');
const upgradeContract = require('./upgrade_contract.js');

const IWETH = artifacts.require("IWETH");
const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const ReserveOracle = artifacts.require("ReserveOracle");
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
    // for WETH
    let weth = await IWETH.at(deployData['WETH'])
    // priceFeedAdmin
    let priceFeedAdmin = deployData['PriceFeedAdmin'];
    // pawnProxyAdmin
    let pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    // 
    let nftOracle;
    {
      if (deployData['PawnNFTOracle'] == undefined || deployData['PawnNFTOracle'] == '') {
        await deployer.deploy(PawnNFTOracle);
        nftOracle = await PawnNFTOracle.deployed();
        {
          deployData['PawnNFTOracle'] = nftOracle.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        nftOracle = await PawnNFTOracle.at(deployData['PawnNFTOracle']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'PawnNFTOracle',
      deployData['PawnNFTOracle'],
      '',
    )
    // 
    if (deployData['PawnNFTOracleProxy'] == undefined || deployData['PawnNFTOracleProxy'] == '') {
      let initializeData = nftOracle.contract.methods.initialize(
        priceFeedAdmin,
        30 * 60,// 30 minutes
      ).encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        nftOracle.address,
        pawnProxyAdmin.address,
        initializeData
      );
      nftOracle = await TransparentUpgradeableProxy.deployed();
      {
        deployData['PawnNFTOracleProxy'] = nftOracle.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    await verifyContract(
      deployData,
      config,
      'PawnNFTOracle',
      deployData['PawnNFTOracleProxy'],
      'TransparentUpgradeableProxy',
    )
    // ReserveOracle
    let reserveOracle;
    {
      if (deployData['ReserveOracle'] == undefined || deployData['ReserveOracle'] == '') {
        await deployer.deploy(ReserveOracle);
        reserveOracle = await ReserveOracle.deployed();
        {
          deployData['ReserveOracle'] = reserveOracle.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        reserveOracle = await ReserveOracle.at(deployData['ReserveOracle']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'ReserveOracle',
      deployData['ReserveOracle'],
      '',
    )
    // ReserveOracleProxy
    if (deployData['ReserveOracleProxy'] == undefined || deployData['ReserveOracleProxy'] == '') {
      let initializeData = reserveOracle.contract.methods.initialize(weth.address).encodeABI();
      await deployer.deploy(
        TransparentUpgradeableProxy,
        reserveOracle.address,
        pawnProxyAdmin.address,
        initializeData
      );
      reserveOracle = await TransparentUpgradeableProxy.deployed();
      {
        deployData['ReserveOracleProxy'] = reserveOracle.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    await verifyContract(
      deployData,
      config,
      'ReserveOracle',
      deployData['ReserveOracleProxy'],
      'TransparentUpgradeableProxy',
    )
    // 
    await upgradeContract(pawnProxyAdmin, deployData['PawnNFTOracleProxy'], deployData['PawnNFTOracle']);
    // 
    await upgradeContract(pawnProxyAdmin, deployData['ReserveOracleProxy'], deployData['ReserveOracle']);
  }
};

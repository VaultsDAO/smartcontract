const fs = require('fs');

const verifyContract = require('./verify_contract.js');
const upgradeContract = require('./upgrade_contract.js');

const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const MockChainlinkOracle = artifacts.require("MockChainlinkOracle");
const MockChainlinkBaseUSD = artifacts.require("MockChainlinkBaseUSD");
const MockNFTOracle = artifacts.require("MockNFTOracle");
const MockNFT = artifacts.require("MockNFT");
const MockReserve = artifacts.require("MockReserve");
const MockWETH = artifacts.require("MockWETH");
const PawnProxyAdmin = artifacts.require("PawnProxyAdmin");


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
    if (deployData['WETH'] == undefined || deployData['WETH'] == '') {
      if (network == 'local') {
        await deployer.deploy(MockWETH);
        let mockWETH = await MockWETH.deployed();
        deployData['WETH'] = mockWETH.address
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    // 
    let priceFeedAdmin = deployData['PriceFeedAdmin'];
    // 
    let pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    // 
    if (network != 'mainnet' || network != 'goerli') {
      let mockNFTOracle;
      if (network != 'mainnet') {
        {
          if (deployData['MockNFTOracle'] == undefined || deployData['MockNFTOracle'] == '') {
            await deployer.deploy(MockNFTOracle);
            mockNFTOracle = await MockNFTOracle.deployed();
            {
              deployData['MockNFTOracle'] = mockNFTOracle.address;
              await fs.writeFileSync(fileName, JSON.stringify(deployData))
            }
          } else {
            mockNFTOracle = await MockNFTOracle.at(deployData['MockNFTOracle']);
          }
          await verifyContract(
            deployData,
            config,
            'MockNFTOracle',
            deployData['MockNFTOracle'],
            '',
          )
        }
        //
        if (deployData['MockNFTOracleProxy'] == undefined || deployData['MockNFTOracleProxy'] == '') {
          let initializeData = mockNFTOracle.contract.methods.initialize(
            priceFeedAdmin,
            web3.utils.toWei('0.2', 'ether'), // _maxPriceDeviation 20%
            web3.utils.toWei('0.1', 'ether'), // _maxPriceDeviationWithTime 10%
            30 * 60,// 30 minutes
            10 * 60,//_minUpdateTime 10 minutes
            10 * 60 // _twapInterval 10 minutes
          ).encodeABI();
          await deployer.deploy(
            TransparentUpgradeableProxy,
            mockNFTOracle.address,
            pawnProxyAdmin.address,
            initializeData
          );
          mockNFTOracle = await TransparentUpgradeableProxy.deployed();
          {
            deployData['MockNFTOracleProxy'] = mockNFTOracle.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData))
          }
        }
      }
      mockNFTOracle = await MockNFTOracle.at(deployData['MockNFTOracleProxy']);
      await verifyContract(
        deployData,
        config,
        'MockNFTOracle',
        deployData['MockNFTOracleProxy'],
        'TransparentUpgradeableProxy',
      )
      await upgradeContract(pawnProxyAdmin, deployData['MockNFTOracleProxy'], deployData['MockNFTOracle']);
    }
    // setup data
    {
      // for nfts
      let collections = deployData["Nfts"]
      for (let i = 0; i < collections.length; i++) {
        let collection = collections[i]
        if (network != 'mainnet') {
          if (collection.Address == undefined || collection.Address == '') {
            await deployer.deploy(MockNFT, collection.Name, collection.Symbol, collection.BaseURI);
            let testNft = await MockNFT.deployed();
            collection.Address = testNft.address
            await fs.writeFileSync(fileName, JSON.stringify(deployData))
          }
          await verifyContract(
            deployData,
            config,
            'MockNFT',
            collection.Address,
            '',
          )
        }
      }
      // for reserves
      let reserves = deployData["Reserves"]
      for (let i = 0; i < reserves.length; i++) {
        let reserve = reserves[i]
        if (network != 'mainnet') {
          if (reserve.Address == undefined || reserve.Address == '') {
            await deployer.deploy(MockReserve, reserve.Name, reserve.Symbol, reserve.Decimals);
            let mockReserve = await MockReserve.deployed();
            reserve.Address = mockReserve.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData))
          }
          await verifyContract(
            deployData,
            config,
            'MockReserve',
            reserve.Address,
            '',
          )
          if (reserve.Aggregator == undefined || reserve.Aggregator == '') {
            // await deployer.deploy(MockChainlinkOracle, 18);
            // let mockChainlinkOracle = await MockChainlinkOracle.deployed();
            // reserve.Aggregator = mockChainlinkOracle.address
            // await fs.writeFileSync(fileName, JSON.stringify(deployData))
            await deployer.deploy(MockChainlinkBaseUSD, '18', reserve.ChainlinkETHUSD);
            let mockChainlinkBaseUSD = await MockChainlinkBaseUSD.deployed();
            reserve.Aggregator = mockChainlinkBaseUSD.address
            await fs.writeFileSync(fileName, JSON.stringify(deployData))
          }
          // await verifyContract(
          //   deployData,
          //   config,
          //   'MockChainlinkOracle',
          //   reserve.Aggregator,
          //   '',
          // )
          await verifyContract(
            deployData,
            config,
            'MockChainlinkBaseUSD',
            reserve.Aggregator,
            '',
          )
        }
      }
    }
    // 
  }
};

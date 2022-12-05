const fs = require('fs');
const verifyContract = require('./verify_contract.js');

const IWETH = artifacts.require("IWETH");
const ReserveOracle = artifacts.require("ReserveOracle");
const BNFTRegistry = artifacts.require("BNFTRegistry");
const ShopFactory = artifacts.require("ShopFactory");
const WETHGateway = artifacts.require("WETHGateway");
const PawnNFTOracle = artifacts.require("PawnNFTOracle");
const MockNFTOracle = artifacts.require("MockNFTOracle");
const MockNFT = artifacts.require("MockNFT");
const MockReserve = artifacts.require("MockReserve");

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
    let bnftRegistry = await BNFTRegistry.at(deployData['BNFTRegistryProxy']);
    let shopFactory = await ShopFactory.at(deployData['ShopFactoryProxy']);
    let mockNFTOracle = await MockNFTOracle.at(deployData['MockNFTOracleProxy']);
    let nftOracle = await PawnNFTOracle.at(deployData['PawnNFTOracleProxy']);
    let wethGateway = await WETHGateway.at(deployData['WETHGatewayProxy']);
    // setup data
    {
      // for nfts
      let collections = deployData["Nfts"]
      for (let i = 0; i < collections.length; i++) {
        let collection = collections[i]
        if (!collection.Finished) {
          let nftIns = await MockNFT.at(collection.Address)
          let nftName = await nftIns.name();
          try {
            await bnftRegistry.createBNFT.estimateGas(nftIns.address)
            await bnftRegistry.createBNFT(nftIns.address)
            console.log('bnftRegistry.createBNFT', nftIns.address, '...Done')
          } catch (ex) {
            console.log('bnftRegistry.createBNFT', nftIns.address, '...Failed')
          }
          try {
            await shopFactory.addNftCollection.estimateGas(nftIns.address, nftName, collection.Total)
            await shopFactory.addNftCollection(nftIns.address, nftName, collection.Total)
            console.log('shopFactory.addNftCollection', nftIns.address, '...Done')
          } catch (ex) {
            console.log('shopFactory.addNftCollection', nftIns.address, '...Failed')
          }
          // for mock
          if (network != 'mainnet') {
            try {
              await mockNFTOracle.addAsset.estimateGas(nftIns.address)
              await mockNFTOracle.addAsset(nftIns.address)
              console.log('mockNFTOracle.addAsset', nftIns.address, '...Done')
            } catch (ex) {
              console.log('mockNFTOracle.addAsset', nftIns.address, '...Failed')
            }
          }
          // try {
          //   await nftOracle.removeAsset.estimateGas(nftIns.address)
          //   await nftOracle.removeAsset(nftIns.address)
          //   console.log('nftOracle.removeAsset', nftIns.address, '...Done')
          // } catch (ex) {
          //   console.log('nftOracle.removeAsset', nftIns.address, '...Failed', ex.toString())
          // }
          try {
            let targetAddress = collection.TargetAddress
            if (targetAddress == undefined || targetAddress == '') {
              targetAddress = nftIns.address
            }
            await nftOracle.addAsset.estimateGas(nftIns.address, mockNFTOracle.address, targetAddress, collection.TargetPriceRate)
            await nftOracle.addAsset(nftIns.address, mockNFTOracle.address, targetAddress, collection.TargetPriceRate)
            console.log('nftOracle.addAsset', nftIns.address, '...Done')
          } catch (ex) {
            console.log('nftOracle.addAsset', nftIns.address, '...Failed', ex.toString())
          }
          try {
            await wethGateway.authorizeLendPoolNFT.estimateGas([nftIns.address])
            await wethGateway.authorizeLendPoolNFT([nftIns.address])
            console.log('wethGateway.authorizeLendPoolNFT', [nftIns.address], '...Done')
          } catch (ex) {
            console.log('wethGateway.authorizeLendPoolNFT', [nftIns.address], '...Failed')
          }
          collection.Finished = true
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      }
    }
  }
};

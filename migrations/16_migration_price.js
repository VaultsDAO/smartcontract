const fs = require('fs');
const verifyContract = require('./verify_contract.js');

const MockChainlinkOracle = artifacts.require("MockChainlinkOracle");
const MockNFTOracle = artifacts.require("MockNFTOracle");

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
    if (network != 'mainnet') {
      // setup data
      {
        // for nfts
        // let mockNFTOracle = await MockNFTOracle.at(deployData['MockNFTOracleProxy']);
        // await mockNFTOracle.setPriceFeedAdmin(options.from)
        // let collections = deployData["Nfts"]
        // for (let i = 0; i < collections.length; i++) {
        //   let collection = collections[i]
        //   await mockNFTOracle.setAssetData(collection.Address, web3.utils.toWei('1', 'ether'));
        //   console.log('mockNFTOracle.setAssetData', collection.Address, web3.utils.toWei('1', 'ether'))
        // }
        // for reserves
        let reserves = deployData["Reserves"]
        for (let i = 0; i < reserves.length; i++) {
          let reserve = reserves[i]
          let mockChainlinkOracle = await MockChainlinkOracle.at(reserve.Aggregator);
          await mockChainlinkOracle.mockAddAnswer(1, web3.utils.toWei(reserve.PriceInETH, 'ether'), Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), 1);
          console.log('mockChainlinkOracle.mockAddAnswer', mockChainlinkOracle.address, reserve.PriceInETH)
        }
      }
    }
  }
};

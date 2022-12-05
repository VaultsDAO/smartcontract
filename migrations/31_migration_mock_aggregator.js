const fs = require('fs');

const verifyContract = require('./verify_contract.js');

const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');
const MockChainlinkBaseUSD = artifacts.require("MockChainlinkBaseUSD");

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
    let mockChainlinkBaseUSD;
    {
      if (deployData['MockChainlinkBaseUSD'] == undefined || deployData['MockChainlinkBaseUSD'] == '') {
        await deployer.deploy(MockChainlinkBaseUSD, '18', deployData['ChainlinkETHUSD']);
        mockChainlinkBaseUSD = await MockChainlinkBaseUSD.deployed();
        {
          deployData['MockChainlinkBaseUSD'] = mockChainlinkBaseUSD.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      } else {
        mockChainlinkBaseUSD = await MockChainlinkBaseUSD.at(deployData['MockChainlinkBaseUSD']);
      }
    }
    await verifyContract(
      deployData,
      config,
      'MockChainlinkBaseUSD',
      deployData['MockChainlinkBaseUSD'],
      '',
    )
  }
};

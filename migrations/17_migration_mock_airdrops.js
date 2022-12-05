const fs = require('fs');
const verifyContract = require('./verify_contract.js');

const MockERC20Airdrop = artifacts.require("MockERC20Airdrop");

module.exports = async function (deployer, network) {
  let options = deployer.options.networks[network]
  if (options.migration) {
    let fileName = process.cwd() + '/migrations/deployed_' + network + '.json';
    let deployData = {}
    if (!(await fs.existsSync(fileName))) {
      throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    let mockERC20Airdrop;
    {
      if (deployData['MockERC20Airdrop'] == undefined || deployData['MockERC20Airdrop'] == '') {
        await deployer.deploy(MockERC20Airdrop, 'AirdropCoin', 'ADC');
        mockERC20Airdrop = await MockERC20Airdrop.deployed();
        {
          deployData['MockERC20Airdrop'] = mockERC20Airdrop.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      }
      mockERC20Airdrop = await MockERC20Airdrop.at(deployData['MockERC20Airdrop']);
    }
    console.log('truffle run verify MockERC20Airdrop@' + deployData['MockERC20Airdrop'] + ' --network ' + network)
    await verifyContract(
      deployData,
      config,
      'MockERC20Airdrop',
      deployData['MockERC20Airdrop'],
      '',
    )
  }
};

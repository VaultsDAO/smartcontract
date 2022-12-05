const fs = require('fs');
const verifyContract = require('./verify_contract.js');

const PawnProxyAdmin = artifacts.require('PawnProxyAdmin');

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
    let pawnProxyAdmin;
    {
      if (deployData['PawnProxyAdmin'] == undefined || deployData['PawnProxyAdmin'] == '') {
        await deployer.deploy(PawnProxyAdmin);
        pawnProxyAdmin = await PawnProxyAdmin.deployed();
        {
          deployData['PawnProxyAdmin'] = pawnProxyAdmin.address;
          await fs.writeFileSync(fileName, JSON.stringify(deployData))
        }
      }
      pawnProxyAdmin = await PawnProxyAdmin.at(deployData['PawnProxyAdmin']);
    }
    await verifyContract(
      deployData,
      config,
      'PawnProxyAdmin',
      deployData['PawnProxyAdmin'],
      '',
    )
  }
};

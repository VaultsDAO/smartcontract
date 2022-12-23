import fs from "fs";

import hre from "hardhat";
import { upgradeContract, verifyContract, waitForDeploy, waitForTx } from "./helpers";

async function main() {
  const network = hre.network.name;
  let fileName = process.cwd() + '/scripts/address/deployed_' + network + '.json';
  let deployData: DeployData;
  if (!(await fs.existsSync(fileName))) {
    throw 'deployed file is not existsed'
  }
  let dataText = await fs.readFileSync(fileName)
  deployData = JSON.parse(dataText.toString())
  // 
  let TokenVault = await hre.ethers.getContractFactory('TokenVault');
  let TokenVaultProxy = await hre.ethers.getContractFactory("TokenVaultProxy");

  var configProvider = await hre.ethers.getContractAt('ConfigProvider', deployData.ConfigProviderProxy);
  // 
  if (deployData.TokenVault == undefined || deployData.TokenVault == '') {
    let tokenVault = await waitForDeploy(await TokenVault.deploy(configProvider.address));
    {
      deployData.TokenVault = tokenVault.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('TokenVault is deployed', tokenVault.address)
    }
  }
  if (deployData.TokenVaultProxy == undefined || deployData.TokenVaultProxy == '') {
    let tokenVaultProxy = await waitForDeploy(await TokenVaultProxy.deploy(configProvider.address));
    {
      deployData.TokenVaultProxy = tokenVaultProxy.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('TokenVaultProxy is deployed', tokenVaultProxy.address)
    }
  }
  // 
  if ((await configProvider.getVaultImpl()).toString().toLowerCase() != deployData.TokenVault.toLowerCase()) {
    await waitForTx(await configProvider.setVaultImpl(deployData.TokenVault))
    console.log('configProvider.setVaultImpl()', deployData.TokenVault)
  }
  if ((await configProvider.getVaultTpl()).toString().toLowerCase() != deployData.TokenVaultProxy.toLowerCase()) {
    await waitForTx(await configProvider.setVaultTpl(deployData.TokenVaultProxy))
    console.log('configProvider.setVaultTpl()', deployData.TokenVaultProxy)
  }
  // 
  {
    await verifyContract(
      deployData,
      network,
      deployData.TokenVault,
      [configProvider.address],
      {},
      "contracts/protocol/TokenVault.sol:TokenVault",
    )
  }
  {
    await verifyContract(
      deployData,
      network,
      deployData.TokenVaultProxy,
      [configProvider.address],
      {},
      "contracts/libraries/proxy/TokenVaultProxy.sol:TokenVaultProxy",
    )
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

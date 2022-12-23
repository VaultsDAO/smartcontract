import fs from "fs";

import hre from "hardhat";
import { upgradeContract, verifyContract, waitForDeploy } from "./helpers";

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
  let TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
  let ConfigProvider = await hre.ethers.getContractFactory("ConfigProvider");
  // 
  var pawnProxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.ProxyAdmin);
  // 
  if (deployData.ConfigProvider == undefined || deployData.ConfigProvider == '') {
    let configProvider = await waitForDeploy(await ConfigProvider.deploy());
    {
      deployData.ConfigProvider = configProvider.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('ConfigProvider is deployed', configProvider.address)
    }
  }
  // 
  if (deployData.ConfigProviderProxy == undefined || deployData.ConfigProviderProxy == '') {
    var configProvider = await hre.ethers.getContractAt('ConfigProvider', deployData.ConfigProvider);
    var initializeData = configProvider.interface.encodeFunctionData('initialize', []);
    var configProviderProxy = await waitForDeploy(
      await TransparentUpgradeableProxy.deploy(
        configProvider.address,
        pawnProxyAdmin.address,
        initializeData,
      )
    );
    {
      deployData.ConfigProviderProxy = configProviderProxy.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('ConfigProviderProxy is deployed', configProviderProxy.address)
    }
  }
  {
    await upgradeContract(pawnProxyAdmin, deployData.ConfigProviderProxy, deployData.ConfigProvider)
  }
  // 
  {
    await verifyContract(
      deployData,
      network,
      deployData.ConfigProvider,
      [],
      {},
      "contracts/protocol/ConfigProvider.sol:ConfigProvider",
    )
  }
  {
    var configProvider = await hre.ethers.getContractAt('ConfigProvider', deployData.ConfigProvider);
    var initializeData = configProvider.interface.encodeFunctionData('initialize', []);
    await verifyContract(
      deployData,
      network,
      deployData.ConfigProviderProxy,
      [
        configProvider.address,
        pawnProxyAdmin.address,
        initializeData,
      ],
      {},
      "contracts/libraries/openzeppelin/proxy/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
    )
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

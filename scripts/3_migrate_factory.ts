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
  let VaultFactory = await hre.ethers.getContractFactory("VaultFactory");

  var configProvider = await hre.ethers.getContractAt('ConfigProvider', deployData.ConfigProviderProxy);
  // 
  var pawnProxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.ProxyAdmin);
  // 
  if (deployData.VaultFactory == undefined || deployData.VaultFactory == '') {
    let vaultFactory = await waitForDeploy(await VaultFactory.deploy(configProvider.address));
    {
      deployData.VaultFactory = vaultFactory.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('ConfigProvider is deployed', vaultFactory.address)
    }
  }
  // 
  if (deployData.VaultFactoryProxy == undefined || deployData.VaultFactoryProxy == '') {
    var vaultFactory = await hre.ethers.getContractAt('VaultFactory', deployData.VaultFactory);
    var initializeData = configProvider.interface.encodeFunctionData('initialize', []);
    var vaultFactoryProxy = await waitForDeploy(
      await TransparentUpgradeableProxy.deploy(
        vaultFactory.address,
        pawnProxyAdmin.address,
        initializeData,
      )
    );
    {
      deployData.VaultFactoryProxy = vaultFactoryProxy.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('VaultFactoryProxy is deployed', vaultFactoryProxy.address)
    }
  }
  {
    await upgradeContract(pawnProxyAdmin, deployData.VaultFactoryProxy, deployData.VaultFactory)
  }
  // 
  {
    await verifyContract(
      deployData,
      network,
      deployData.VaultFactory,
      [],
      {},
      "contracts/protocol/VaultFactory.sol:VaultFactory",
    )
  }
  {
    var vaultFactory = await hre.ethers.getContractAt('VaultFactory', deployData.VaultFactory);
    var initializeData = vaultFactory.interface.encodeFunctionData('initialize', []);
    await verifyContract(
      deployData,
      network,
      deployData.VaultFactoryProxy,
      [
        vaultFactory.address,
        pawnProxyAdmin.address,
        initializeData,
      ],
      {},
      "contracts/openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy",
    )
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

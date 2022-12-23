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
  let FragmentFactory = await hre.ethers.getContractFactory("FragmentFactory");

  var configProvider = await hre.ethers.getContractAt('ConfigProvider', deployData.ConfigProviderProxy);
  // 
  var pawnProxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.ProxyAdmin);
  // 
  if (deployData.FragmentFactory == undefined || deployData.FragmentFactory == '') {
    let fragmentFactory = await waitForDeploy(await FragmentFactory.deploy(configProvider.address));
    {
      deployData.FragmentFactory = fragmentFactory.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('ConfigProvider is deployed', fragmentFactory.address)
    }
  }
  // 
  if (deployData.FragmentFactoryProxy == undefined || deployData.FragmentFactoryProxy == '') {
    var fragmentFactory = await hre.ethers.getContractAt('FragmentFactory', deployData.FragmentFactory);
    var initializeData = configProvider.interface.encodeFunctionData('initialize', []);
    var fragmentFactoryProxy = await waitForDeploy(
      await TransparentUpgradeableProxy.deploy(
        fragmentFactory.address,
        pawnProxyAdmin.address,
        initializeData,
      )
    );
    {
      deployData.FragmentFactoryProxy = fragmentFactoryProxy.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('FragmentFactoryProxy is deployed', fragmentFactoryProxy.address)
    }
  }
  {
    await upgradeContract(pawnProxyAdmin, deployData.FragmentFactoryProxy, deployData.FragmentFactory)
  }
  // 
  {
    await verifyContract(
      deployData,
      network,
      deployData.FragmentFactory,
      [configProvider.address],
      {},
      "contracts/protocol/FragmentFactory.sol:FragmentFactory",
    )
  }
  {
    var fragmentFactory = await hre.ethers.getContractAt('FragmentFactory', deployData.FragmentFactory);
    var initializeData = fragmentFactory.interface.encodeFunctionData('initialize', []);
    await verifyContract(
      deployData,
      network,
      deployData.FragmentFactoryProxy,
      [
        fragmentFactory.address,
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

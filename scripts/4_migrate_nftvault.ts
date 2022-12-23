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
  let FragmentNFT = await hre.ethers.getContractFactory('FragmentNFT');
  let FragmentNFTProxy = await hre.ethers.getContractFactory("FragmentNFTProxy");

  var configProvider = await hre.ethers.getContractAt('ConfigProvider', deployData.ConfigProviderProxy);
  // 
  if (deployData.FragmentNFT == undefined || deployData.FragmentNFT == '') {
    let tokenFragment = await waitForDeploy(await FragmentNFT.deploy(configProvider.address));
    {
      deployData.FragmentNFT = tokenFragment.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('FragmentNFT is deployed', tokenFragment.address)
    }
  }
  if (deployData.FragmentNFTProxy == undefined || deployData.FragmentNFTProxy == '') {
    let fragmentNFTProxy = await waitForDeploy(await FragmentNFTProxy.deploy(configProvider.address));
    {
      deployData.FragmentNFTProxy = fragmentNFTProxy.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
      console.log('FragmentNFTProxy is deployed', fragmentNFTProxy.address)
    }
  }
  // 
  if ((await configProvider.getFragmentImpl()).toString().toLowerCase() != deployData.FragmentNFT.toLowerCase()) {
    await waitForTx(await configProvider.setFragmentImpl(deployData.FragmentNFT))
    console.log('configProvider.setFragmentImpl()', deployData.FragmentNFT)
  }
  if ((await configProvider.getFragmentTpl()).toString().toLowerCase() != deployData.FragmentNFTProxy.toLowerCase()) {
    await waitForTx(await configProvider.setFragmentTpl(deployData.FragmentNFTProxy))
    console.log('configProvider.setFragmentTpl()', deployData.FragmentNFTProxy)
  }
  // 
  {
    await verifyContract(
      deployData,
      network,
      deployData.FragmentNFT,
      [configProvider.address],
      {},
      "contracts/protocol/FragmentNFT.sol:FragmentNFT",
    )
  }
  {
    await verifyContract(
      deployData,
      network,
      deployData.FragmentNFTProxy,
      [configProvider.address],
      {},
      "contracts/libraries/proxy/FragmentNFTProxy.sol:FragmentNFTProxy",
    )
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

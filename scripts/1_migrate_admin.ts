import fs from "fs";

import hre from "hardhat";
import { verifyContract, waitForDeploy } from "./helpers";

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
  if (deployData.ProxyAdmin == undefined || deployData.ProxyAdmin == '') {
    let ProxyAdmin = await hre.ethers.getContractFactory('ProxyAdmin');
    let pawnProxyAdmin = await waitForDeploy(await ProxyAdmin.deploy());
    {
      deployData.ProxyAdmin = pawnProxyAdmin.address;
      await fs.writeFileSync(fileName, JSON.stringify(deployData))
    }
    console.log('ProxyAdmin is deployed', pawnProxyAdmin.address)
  }
  {
    await verifyContract(
      deployData,
      network,
      deployData.ProxyAdmin,
      [],
      {},
      "contracts/libraries/openzeppelin/proxy/ProxyAdmin.sol:ProxyAdmin",
    )
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

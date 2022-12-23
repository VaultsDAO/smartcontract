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
  if (network != 'mainnet') {
    if (deployData.MockNFT == undefined || deployData.MockNFT == '') {
      let MockNFT = await hre.ethers.getContractFactory('MockNFT');
      let mockNFT = await waitForDeploy(await MockNFT.deploy('BoredApeYachtClub', 'BAYC', 'ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/'));
      {
        deployData.MockNFT = mockNFT.address;
        await fs.writeFileSync(fileName, JSON.stringify(deployData))
      }
    }
    {
      await verifyContract(
        deployData,
        network,
        deployData.MockNFT,
        ['BoredApeYachtClub', 'BAYC', 'ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/'],
        {},
        "contracts/mock/MockNFT.sol:MockNFT",
      )
    }
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

const { waitForDeploy, verifyContract } = helpers;

async function main() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deployments/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 
    if (deployData.proxyAdminAddress == undefined || deployData.proxyAdminAddress == '') {
        let ProxyAdmin = await hre.ethers.getContractFactory('ProxyAdmin');
        let proxyAdmin = await waitForDeploy(await ProxyAdmin.deploy());
        {
            deployData.proxyAdminAddress = proxyAdmin.address;
            await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
        }
        console.log('ProxyAdmin is deployed', proxyAdmin.address)
    }
    {
        await verifyContract(
            deployData,
            network,
            deployData.proxyAdminAddress,
            [],
            {},
            "@openzeppelin/contracts/proxy/ProxyAdmin.sol:ProxyAdmin",
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
import fs from "fs";

import hre from "hardhat";
import helpers from "./helpers";

const { waitForDeploy } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let fileName = process.cwd() + '/deploy/testnet/address/deployed_' + network + '.json';
    let deployData: DeployData;
    if (!(await fs.existsSync(fileName))) {
        throw 'deployed file is not existsed'
    }
    let dataText = await fs.readFileSync(fileName)
    deployData = JSON.parse(dataText.toString())
    // 
    const UniswapV3Factory = await hre.ethers.getContractFactory("UniswapV3Factory")
    // 
    if (network == 'local') {
        if (deployData.uniswapV3Factory.address == undefined || deployData.uniswapV3Factory.address == '') {
            const uniV3Factory = await waitForDeploy(await UniswapV3Factory.deploy())
            {
                deployData.uniswapV3Factory.address = uniV3Factory.address;
                await fs.writeFileSync(fileName, JSON.stringify(deployData, null, 4))
                console.log('uniV3Factory is deployed', uniV3Factory.address)
            }
        }
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });
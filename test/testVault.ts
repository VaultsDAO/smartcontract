import hre, { ethers } from "hardhat";
import { setupInstance } from "./setup";

describe("Test borrow", function () {
    it("Borrow", async function () {
        let deployment = await setupInstance();
        let testNft = deployment.testNft
        let fragmentFactory = deployment.fragmentFactory
        let configProvider = deployment.configProvider
        let [curator, buyer1, buyer2] = [deployment.accounts.curator, deployment.accounts.buyer1, deployment.accounts.buyer2]

        await testNft.connect(curator).mint(curator.address, 1);

        await testNft.connect(curator).setApprovalForAll(fragmentFactory.address, true);

        await fragmentFactory.connect(curator).mint('XXX', 'XXX', [testNft.address], [1], 100, ethers.utils.parseUnits('0.1', 'ether'));

        let rs = await fragmentFactory.connect(curator).fragments('1');
        console.log(rs)

        let fragmentNFT = await ethers.getContractAt('FragmentNFT', rs)

        await fragmentNFT.buyTokens(2, {value: ethers.utils.parseUnits('0.2', 'ether')})

        let tokenURI = await fragmentNFT.tokenURI('1')
        console.log(tokenURI)
    });
});
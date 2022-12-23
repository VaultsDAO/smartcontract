const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { setupInstance } = require("./setup.js")

describe("testFragment", function () {
  describe("Deployment", function () {
    it("testFragment", async function () {
      let deployment = await setupInstance();
      let testNft = deployment.testNft
      let fragmentFactory = deployment.fragmentFactory
      let configProvider = deployment.configProvider
      let [curator, buyer1, buyer2] = [deployment.accounts.curator, deployment.accounts.buyer1, deployment.accounts.buyer2]

      await testNft.connect(curator).mint(curator.address, 1);

      await testNft.connect(curator).setApprovalForAll(fragmentFactory.address, true);

      await fragmentFactory.connect(curator).mint('XXX', 'XXX', [testNft.address], [1], 100, ethers.utils.parseUnits('0.1', 'ether'));

      let rs = await fragmentFactory.connect(curator).fragments('0');
      console.log(rs)
    });
  });
});

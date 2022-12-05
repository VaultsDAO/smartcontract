const MockReserve = artifacts.require("MockReserve");
const MockNFT = artifacts.require("MockNFT");
const MockERC1155 = artifacts.require("MockERC1155");

var BN = web3.utils.BN;

var utils = require('./utils.js')


/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */


contract("Factory", function (accounts) {
  const [pawnProxyAdminOwner, priceFeedAdmin, platformFeeReceiver, lender, borrower, bidder1, bidder2] = accounts;

  it("new loan", async function () {
    // setup
    let deployment = await require('./setup.js')(accounts)

    let weth = deployment.weth
    let usdc = deployment.usdc
    let testNft = deployment.testNft
    let pawnProxyAdmin = deployment.pawnProxyAdmin
    let provider = deployment.provider
    let shopFactory = deployment.shopFactory
    let shopLoan = deployment.shopLoan
    let bnft = deployment.bnft
    let bnftRegistry = deployment.bnftRegistry
    let userFlashclaimRegistry = deployment.userFlashclaimRegistry
    let mockNFTOracle = deployment.mockNFTOracle
    let nftOracle = deployment.nftOracle
    let mockUSDCChainlinkOracle = deployment.mockUSDCChainlinkOracle
    let reserveOracle = deployment.reserveOracle
    let wethGateway = deployment.wethGateway

    // for tesing ---------------------------------------------------------------
    let preBalances = {}
    let testAddress = [lender, borrower, bidder1, bidder2, shopFactory.address, platformFeeReceiver]

    rs = await shopFactory.shops('1')

    await shopFactory.setShopConfigurations(
      [
        {
          reserveAddress: usdc.address,
          nftAddress: testNft.address,
          interestRate: 1000,
          ltvRate: 4000,
          active: true
        }
      ],
      { from: lender }
    )


    //=== faucet asset
    await usdc.mint(bidder1, web3.utils.toWei('1000', 'mwei'), { from: bidder1 })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: bidder1 })

    await usdc.mint(bidder2, web3.utils.toWei('1000', 'mwei'), { from: bidder2 })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: bidder2 })

    await usdc.mint(lender, web3.utils.toWei('1000', 'mwei'), { from: lender })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: lender })

    await usdc.mint(borrower, web3.utils.toWei('1000', 'mwei'), { from: borrower })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: borrower })

    await testNft.mint(borrower, '1', { from: borrower });
    await testNft.mint(borrower, '2', { from: borrower });

    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)

    //========================borrow USDC
    let borrowAmount1 = new BN(10000000)//10
    let borrowAmount2 = new BN(20000000)//20

    await testNft.setApprovalForAll(shopFactory.address, true, { from: borrower });

    rs = await shopFactory.batchBorrow(
      '1',
      [usdc.address, usdc.address],
      [borrowAmount1, borrowAmount2],
      [testNft.address, testNft.address],
      ['1', '2'],
      borrower,
      { from: borrower }
    );

    await userFlashclaimRegistry.createReceiver({ from: borrower })
    let receiverAddress = await userFlashclaimRegistry.userReceivers(borrower)

    // for ERC20
    let mockErc20Airdrop = await MockReserve.new('MockAirdrop', 'MAD', 18);
    await bnft.flashLoan(
      receiverAddress,
      [1, 2],
      web3.eth.abi.encodeParameters(
        [
          'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes',
        ],
        [
          ['1'],
          [mockErc20Airdrop.address],
          [web3.utils.toWei('1000', 'mwei')],
          mockErc20Airdrop.address,
          mockErc20Airdrop.contract.methods.mint(receiverAddress, web3.utils.toWei('1000', 'ether')).encodeABI(),
        ],
      ),
      { from: borrower }
    )
    assert.isTrue((await mockErc20Airdrop.balanceOf(borrower)).toString() == web3.utils.toWei('1000', 'ether').toString())
    // for ERC721
    let mockErc721Airdrop = await MockNFT.new('MockAirdrop', 'MAD', '');
    await bnft.flashLoan(
      receiverAddress,
      [1, 2],
      web3.eth.abi.encodeParameters(
        [
          'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes',
        ],
        [
          ['2'],
          [mockErc721Airdrop.address],
          ['1'],
          mockErc721Airdrop.address,
          mockErc721Airdrop.contract.methods.mint(receiverAddress, '1').encodeABI(),
        ],
      ),
      { from: borrower }
    )
    assert.isTrue((await mockErc721Airdrop.ownerOf('1')).toString() == borrower.toString())
    // 
    mockErc721Airdrop = await MockNFT.new('MockAirdrop', 'MAD', '');
    await bnft.flashLoan(
      receiverAddress,
      [1, 2],
      web3.eth.abi.encodeParameters(
        [
          'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes',
        ],
        [
          ['4'],
          [mockErc721Airdrop.address],
          ['1'],
          mockErc721Airdrop.address,
          mockErc721Airdrop.contract.methods.mint(receiverAddress, '1').encodeABI(),
        ],
      ),
      { from: borrower }
    )
    assert.isTrue((await mockErc721Airdrop.ownerOf('1')).toString() == borrower.toString())
    // for ERC1155
    let mockErc1155Airdrop = await MockERC1155.new();
    await bnft.flashLoan(
      receiverAddress,
      [1, 2],
      web3.eth.abi.encodeParameters(
        [
          'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes',
        ],
        [
          ['3'],
          [mockErc1155Airdrop.address],
          ['1'],
          mockErc1155Airdrop.address,
          mockErc1155Airdrop.contract.methods.mint(receiverAddress, '1', web3.utils.toWei('1000', 'ether')).encodeABI(),
        ],
      ),
      { from: borrower }
    )
    assert.isTrue((await mockErc1155Airdrop.balanceOf(borrower, '1')).toString() == web3.utils.toWei('1000', 'ether').toString())
  });
});

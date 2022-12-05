const MockERC20Airdrop = artifacts.require("MockERC20Airdrop");
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
    //setup loan duration = 1 seconds
    await provider.setMaxLoanDuration(1);
    // for tesing ---------------------------------------------------------------
    let preETHBalances = {}
    let preWETHBalances = {}
    let testAddress = [lender, borrower, bidder1, bidder2, shopFactory.address, platformFeeReceiver]

    rs = await shopFactory.shops('1')
    // console.log(rs)

    await shopFactory.setShopConfigurations(
      [
        {
          reserveAddress: weth.address,
          nftAddress: testNft.address,
          interestRate: 1000,
          ltvRate: 4000,
          active: true
        }
      ],
      { from: lender }
    )

    //faucet
    await weth.deposit({ value: web3.utils.toWei('0.2', 'ether'), from: lender })

    await weth.approve(shopFactory.address, web3.utils.toWei('1000', 'ether'), { from: lender })

    await testNft.mint(borrower, '1', { from: borrower });
    await testNft.mint(borrower, '2', { from: borrower });

    //========================borrow ETH
    await testNft.setApprovalForAll(wethGateway.address, true, { from: borrower });

    let borrowAmount1 = new BN(web3.utils.toWei('0.01', 'ether'))
    let borrowAmount2 = new BN(web3.utils.toWei('0.02', 'ether'))

    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)

    rs = await wethGateway.batchBorrowETH(
      '1',
      [borrowAmount1, borrowAmount2],
      [testNft.address, testNft.address],
      ['1', '2'],
      borrower,
      { from: borrower }
    );

    await userFlashclaimRegistry.createReceiver({ from: borrower })
    let receiverAddress = await userFlashclaimRegistry.userReceivers(borrower)

    // for ERC20
    let mockErc20Airdrop = await MockERC20Airdrop.new('AirdropCoin', 'ADC');
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
          [web3.utils.toWei('12345', 'ether')],
          mockErc20Airdrop.address,
          mockErc20Airdrop.contract.methods.claimTokens().encodeABI(),
        ],
      ),
      { from: borrower }
    )
    assert.isTrue((await mockErc20Airdrop.balanceOf(borrower)).toString() == web3.utils.toWei('12345', 'ether').toString())
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

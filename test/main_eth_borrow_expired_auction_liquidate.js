const Ishop = artifacts.require("Ishop");
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
    await testNft.setApprovalForAll(shopFactory.address, true, { from: borrower });

    let borrowAmount1 = new BN(web3.utils.toWei('0.01', 'ether'))
    let borrowAmount2 = new BN(web3.utils.toWei('0.02', 'ether'))

    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)

    rs = await shopFactory.batchBorrowETH(
      '1',
      [borrowAmount1, borrowAmount2],
      [testNft.address, testNft.address],
      ['1', '2'],
      borrower,
      { from: borrower }
    );
    let gasCost = await utils.gasCost(rs);
    let logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Borrow')
    let loanId1 = logs[0].loanId

    //verify borrower balance (borrowAmount1 + borrowAmount2 - gasUsed)
    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], borrowAmount1.add(borrowAmount2), gasCost))
    //verify lender balance ( -(borrowAmount1 + borrowAmount2))
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], 0, borrowAmount1.add(borrowAmount2)))

    //verify owner nft (bnft)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, bnft.address))
    assert.isTrue(await utils.verifyOwnerNft(testNft, 2, bnft.address))

    //======================= auction
    await utils.waitAndEvmMine(2000);
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    //bidder1
    rs = await shopFactory.getNftLiquidatePrice(
      loanId1,
      { from: borrower }
    );

    let bidPrice = rs.liquidatePrice
    rs = await shopFactory.auctionETH(
      loanId1,
      bidder1,
      { value: bidPrice, from: bidder1 }
    );
    gasCost = await utils.gasCost(rs);
    //verify loan status (auction)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Auction))
    //verify bidder balance (-(bidPrice + gasCost))
    assert.isTrue(await utils.verifyETHBalance(bidder1, preETHBalances[bidder1], 0, bidPrice.add(gasCost)))
    //verify shopFactory balance (+bidPrice)
    assert.isTrue(await utils.verifyBalance(weth, shopFactory.address, preWETHBalances[shopFactory.address], bidPrice, 0))

    //bibder2
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    //getNftAuctionData
    rs = await shopFactory.getNftAuctionData(
      loanId1,
      { from: bidder2 }
    );
    let lastBid = rs.bidPrice;
    bidPrice = rs.bidBorrowAmount.mul(new BN(110)).div(new BN(10000)).add(lastBid) //1.1%
    rs = await shopFactory.auctionETH(
      loanId1,
      bidder2,
      { value: bidPrice, from: bidder2 }
    );
    gasCost = await utils.gasCost(rs);
    //verify bidder1 balance (+lastBid) 
    assert.isTrue(await utils.verifyETHBalance(bidder1, preETHBalances[bidder1], lastBid, 0))

    //verify bidder2 balance (-(bidPrice + gasCost))
    assert.isTrue(await utils.verifyETHBalance(bidder2, preETHBalances[bidder2], 0, bidPrice.add(gasCost)))

    //verify shopFactory balance (+bidPrice -lastBid) WETH
    assert.isTrue(await utils.verifyBalance(weth, shopFactory.address, preWETHBalances[shopFactory.address], bidPrice, lastBid))

    //============================= liquidate
    rs = await shopFactory.getNftDebtData(
      loanId1,
      { from: borrower }
    );
    let totalDebt = rs.totalDebt

    await utils.waitAndEvmMine(1000);


    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    await provider.setRedeemDuration(0);
    await provider.setAuctionDuration(0);

    rs = await shopFactory.getNftDebtData(
      loanId1,
      { from: borrower }
    );
    totalDebt = rs.totalDebt


    rs = await shopFactory.liquidate(
      loanId1,
      { value: web3.utils.toWei('0', 'ether'), from: bidder2 }
    );

    gasCost = await utils.gasCost(rs);
    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Liquidate')


    let feeAmount = logs[0].feeAmount
    let remainAmount = logs[0].remainAmount
    //check loan status (Defaulted)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Defaulted));

    //verify owner nft (bidder2)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, bidder2))

    //verify lender balance (+totalDebt, -feeAmount)
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], totalDebt, feeAmount))

    //verify borrower balance (+remainAmount)
    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], remainAmount, 0))

    //verify platformfee balance (+feeAmount)
    assert.isTrue(await utils.verifyBalance(weth, platformFeeReceiver, preWETHBalances[platformFeeReceiver], feeAmount, 0))


    return assert.isTrue(true);
  });
});

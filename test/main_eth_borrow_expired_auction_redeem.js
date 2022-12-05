const Ishop = artifacts.require("Ishop");
const truffleAssert = require('truffle-assertions');
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

      rs = await shopFactory.getNftLiquidatePrice(
      loanId1,
      { from: borrower }
    );

    let bidPrice = rs.liquidatePrice

    //bid auction duration not end
     await truffleAssert.reverts(
          wethGateway.auctionETH(
      loanId1,
      bidder1,
      { value: bidPrice, from: bidder1 }
    ),
        );


    //======================= auction
    await utils.waitAndEvmMine(2000);
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    //bidder1
    rs = await shopFactory.getNftLiquidatePrice(
      loanId1,
      { from: borrower }
    );

     bidPrice = rs.liquidatePrice
    rs = await wethGateway.auctionETH(
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
    assert.isTrue(await utils.verifyBalance(weth, shopFactory.address, preWETHBalances[shopFactory.address], bidPrice, 0));


    rs = await shopFactory.getNftAuctionData(
      loanId1,
      { from: borrower }
    );

    //redeem from 40% - 90% debtamount
    let bidFine = new BN(rs.bidFine)
    let repayAmount = new BN(rs.bidBorrowAmount).mul(new BN(6000)).div(new BN(10000))
    rs = await wethGateway.redeemETH(
      loanId1,
      repayAmount,
      bidFine,
      { value: repayAmount.add(bidFine), from: borrower }
    );

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
    rs = await wethGateway.auctionETH(
      loanId1,
      bidder2,
      { value: bidPrice, from: bidder2 }
    );
    gasCost = await utils.gasCost(rs);
    //verify bidder1 balance (+lastBid) ETH
    assert.isTrue(await utils.verifyETHBalance(bidder1, preETHBalances[bidder1], lastBid, 0))

    //verify bidder2 balance (-(bidPrice + gasCost))
    assert.isTrue(await utils.verifyETHBalance(bidder2, preETHBalances[bidder2], 0, bidPrice.add(gasCost)))

    //verify shopFactory balance (+bidPrice -lastBid) WETH
    assert.isTrue(await utils.verifyBalance(weth, shopFactory.address, preWETHBalances[shopFactory.address], bidPrice, lastBid));





    //============================= redeem 
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    rs = await shopFactory.getNftAuctionData(
      loanId1,
      { from: borrower }
    );

    //redeem from 40% - 90% debtamount
     bidFine = new BN(rs.bidFine)
     repayAmount = new BN(rs.bidBorrowAmount).mul(new BN(6000)).div(new BN(10000))
    rs = await wethGateway.redeemETH(
      loanId1,
      repayAmount,
      bidFine,
      { value: repayAmount.add(bidFine), from: borrower }
    );
    gasCost = await utils.gasCost(rs);
    //====verify
    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Redeem')
    let repayPrincipal = new BN(logs[0].repayPrincipal)
    let fee = new BN(logs[0].fee)
    //verify bidder1 balance (+bidFine) ETH
    assert.isTrue(await utils.verifyETHBalance(bidder1, preETHBalances[bidder1], bidFine, 0))

    //verify bidder2 balance (+bidPrice)
    assert.isTrue(await utils.verifyETHBalance(bidder2, preETHBalances[bidder2], bidPrice, 0))

    //verify shopFactory balance (-bidPrice)
    assert.isTrue(await utils.verifyBalance(weth, shopFactory.address, preWETHBalances[shopFactory.address], 0, bidPrice))

    //verify platformfee balance
    assert.isTrue(await utils.verifyBalance(weth, platformFeeReceiver, preWETHBalances[platformFeeReceiver], fee, 0))

    //verify borrower balance (- (redeemAmount + bidFine + gasCost))

    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], 0, repayAmount.add(bidFine).add(gasCost)))

    //verify lender balance (+(repayAmount - fee))
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], repayAmount.sub(fee), 0))

    //check loan status (Active)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Active))

    //verify loan amount borrowAmount = preBorrowAmount - repayPrincipal
    rs = await shopLoan.getLoan(loanId1)
    assert.isTrue(new BN(borrowAmount1).sub(new BN(rs.borrowAmount).add(repayPrincipal)) == 0)
    //=======================repay loan1
    preETHBalances = await utils.logPreETHBalances(preETHBalances, testAddress)
    preWETHBalances = await utils.logPreBalances(preWETHBalances, weth, testAddress)
    rs = await shopFactory.getNftDebtData(
      loanId1,
      { from: borrower }
    );

    totalDebt = rs.totalDebt

    rs = await wethGateway.repayETH(
      loanId1,
      totalDebt,
      { value: totalDebt, from: borrower }
    );
    gasCost = await utils.gasCost(rs);
    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Repay')
    fee = logs[0].feeAmount

    //verify loan status (Repaid)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Repaid))

    //verify borrower balance (-(totalDebt + gasCost))
    assert.isTrue(await utils.verifyETHBalance(borrower, preETHBalances[borrower], 0, gasCost.add(totalDebt)))

    //verify lender balance (totalDebt-fee)
    assert.isTrue(await utils.verifyBalance(weth, lender, preWETHBalances[lender], totalDebt, fee))

    //verify owner nft(borrower)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, borrower))

    return assert.isTrue(true);
  });
});

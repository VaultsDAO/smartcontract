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


    //setup loan duration = 1 seconds
    await provider.setMaxLoanDuration(1);
    //========================borrow USDC

    await testNft.setApprovalForAll(shopFactory.address, true, { from: borrower });

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

    let logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Borrow')
    let loanId1 = logs[0].loanId
    let loanId2 = logs[1].loanId

    //verify borrower balance (borrowAmount1 + borrowAmount2)
    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], borrowAmount1.add(borrowAmount2), 0))

    //verify lender balance ( -(borrowAmount1 + borrowAmount2))
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], 0, borrowAmount1.add(borrowAmount2)))

    //verify owner nft (bnft)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, bnft.address))
    assert.isTrue(await utils.verifyOwnerNft(testNft, 2, bnft.address))
    //======================= auction
    await utils.waitAndEvmMine(2000);

    //bidder1
    rs = await shopFactory.getNftLiquidatePrice(
      loanId1,
      { from: borrower }
    );

    let bidPrice = rs.liquidatePrice
    await shopFactory.auction(
      loanId1,
      bidPrice,
      bidder1,
      { from: bidder1 }
    );
    //verify loan status (auction)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Auction))
    //verify bidder balance (-bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, bidder1, preBalances[bidder1], 0, bidPrice))
    //verify shopFactory balance (+bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, shopFactory.address, preBalances[shopFactory.address], bidPrice, 0))

    //bibder2
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)
    //getNftAuctionData
    rs = await shopFactory.getNftAuctionData(
      loanId1,
      { from: bidder2 }
    );
    let lastBid = rs.bidPrice;
    bidPrice = rs.bidBorrowAmount.mul(new BN(110)).div(new BN(10000)).add(lastBid) //1.1%
    await shopFactory.auction(
      loanId1,
      bidPrice,//higher than 1%
      bidder2,
      { from: bidder2 }
    );
    //verify bidder1 balance (+lastBid)
    assert.isTrue(await utils.verifyBalance(usdc, bidder1, preBalances[bidder1], lastBid, 0))

    //verify bidder2 balance (-bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, bidder2, preBalances[bidder2], 0, bidPrice))

    //verify shopFactory balance (+bidPrice -lastBid)
    assert.isTrue(await utils.verifyBalance(usdc, shopFactory.address, preBalances[shopFactory.address], bidPrice, lastBid))

    //============================= redeem 
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)
    rs = await shopFactory.getNftAuctionData(
      loanId1,
      { from: borrower }
    );

    //redeem from 40% - 90% debtamount
    let bidFine = new BN(rs.bidFine)
    let repayAmount = rs.bidBorrowAmount.mul(new BN(6000)).div(new BN(10000))
    rs = await shopFactory.redeem(
      loanId1,
      repayAmount,
      bidFine,
      { from: borrower }
    );
    //====verify
    let repayPrincipal = new BN(rs.logs[0].args.repayPrincipal)
    let fee = new BN(rs.logs[0].args.fee)
    //verify bidder1 balance (+bidFine)
    assert.isTrue(await utils.verifyBalance(usdc, bidder1, preBalances[bidder1], bidFine, 0))

    //verify bidder2 balance (+bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, bidder2, preBalances[bidder2], bidPrice, 0))

    //verify shopFactory balance (-bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, shopFactory.address, preBalances[shopFactory.address], 0, bidPrice))

    //verify platformfee balance
    assert.isTrue(await utils.verifyBalance(usdc, platformFeeReceiver, preBalances[platformFeeReceiver], fee, 0))

    //verify borrower balance (- (redeemAmount + bidFine))

    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], 0, repayAmount.add(bidFine)))

    //verify lender balance (+(repayAmount - fee))
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], repayAmount.sub(fee), 0))

    //check loan status (Active)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Active))

    //verify loan amount borrowAmount = preBorrowAmount - repayPrincipal
    rs = await shopLoan.getLoan(loanId1)
    assert.isTrue(new BN(borrowAmount1).sub(new BN(rs.borrowAmount).add(repayPrincipal)) == 0)
    //=======================repay loan1
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)

    //getNftDebtData
    rs = await shopFactory.getNftDebtData(
      loanId1,
      { from: borrower }
    );

    let totalDebt = rs.totalDebt
    rs = await shopFactory.repay(
      loanId1,
      totalDebt,
      { from: borrower }
    );
    fee = rs.logs[0].args.feeAmount
    //check loan status (Repaid)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Repaid))
    //verify borrower balance
    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], 0, totalDebt))

    //verify lender balance
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], totalDebt, fee))

    //verify owner nft
    assert.isTrue(await utils.verifyOwnerNft(testNft, 1, borrower))

    ////======================= AUCTION NFT2
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)
    //bidder1
    rs = await shopFactory.getNftLiquidatePrice(
      loanId2,
      { from: borrower }
    );

    bidPrice = rs.liquidatePrice
    await shopFactory.auction(
      loanId2,
      bidPrice,
      bidder1,
      { from: bidder1 }
    );
    //verify loan status (auction)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId2, utils.LoanState.Auction))
    //verify bidder balance (-bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, bidder1, preBalances[bidder1], 0, bidPrice))
    //verify shopFactory balance (+bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, shopFactory.address, preBalances[shopFactory.address], bidPrice, 0))

    //bibder2
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)
    //getNftAuctionData
    rs = await shopFactory.getNftAuctionData(
      loanId2,
      { from: bidder2 }
    );
    lastBid = rs.bidPrice;
    bidPrice = rs.bidBorrowAmount.mul(new BN(110)).div(new BN(10000)).add(lastBid) //1.1%
    await shopFactory.auction(
      loanId2,
      bidPrice,//higher than 1%
      bidder2,
      { from: bidder2 }
    );
    //verify bidder1 balance (+lastBid)
    assert.isTrue(await utils.verifyBalance(usdc, bidder1, preBalances[bidder1], lastBid, 0))

    //verify bidder2 balance (-bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, bidder2, preBalances[bidder2], 0, bidPrice))

    //verify shopFactory balance (+bidPrice -lastBid)
    assert.isTrue(await utils.verifyBalance(usdc, shopFactory.address, preBalances[shopFactory.address], bidPrice, lastBid))

    //============================= redeem 
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)
    rs = await shopFactory.getNftAuctionData(
      loanId2,
      { from: borrower }
    );

    //redeem full => repay 
    bidFine = new BN(rs.bidFine)
    rs = await shopFactory.getNftDebtData(
      loanId2,
      { from: borrower }
    );

    repayAmount = rs.totalDebt
    rs = await shopFactory.redeem(
      loanId2,
      repayAmount,
      bidFine,
      { from: borrower }
    );
    //====verify
    repayPrincipal = new BN(rs.logs[0].args.repayPrincipal)
    fee = new BN(rs.logs[0].args.fee)
    //verify bidder1 balance (+bidFine)
    assert.isTrue(await utils.verifyBalance(usdc, bidder1, preBalances[bidder1], bidFine, 0))

    //verify bidder2 balance (+bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, bidder2, preBalances[bidder2], bidPrice, 0))

    //verify shopFactory balance (-bidPrice)
    assert.isTrue(await utils.verifyBalance(usdc, shopFactory.address, preBalances[shopFactory.address], 0, bidPrice))

    //verify platformfee balance
    assert.isTrue(await utils.verifyBalance(usdc, platformFeeReceiver, preBalances[platformFeeReceiver], fee, 0))

    //verify borrower balance (- (redeemAmount + bidFine))

    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], 0, repayAmount.add(bidFine)))

    //verify lender balance (+(repayAmount - fee))
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], repayAmount.sub(fee), 0))

    //check loan status (Repaid)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Repaid))

    //verify loan amount borrowAmount = preBorrowAmount - repayPrincipal
    rs = await shopLoan.getLoan(loanId1)
    assert.isTrue(new BN(borrowAmount2).sub(new BN(rs.borrowAmount).add(repayPrincipal)) == 0)

    //verify owner nft (borrower)
    assert.isTrue(await utils.verifyOwnerNft(testNft, 2, borrower))



    return assert.isTrue(true);
  });
});

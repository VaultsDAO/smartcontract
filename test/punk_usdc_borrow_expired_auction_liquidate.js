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
    let punkGateway = deployment.punkGateway
    let cPunk = deployment.cPunk
    let wPunk = deployment.wPunk
    let wPunkBnft = deployment.wPunkBnft


    // for tesing ---------------------------------------------------------------
    let preBalances = {}
    let testAddress = [lender, borrower, bidder1, bidder2, shopFactory.address, platformFeeReceiver]

    rs = await shopFactory.shops('1')

    await shopFactory.setShopConfigurations(
      [
        {
          reserveAddress: usdc.address,
          nftAddress: wPunk.address,
          interestRate: 1000,
          ltvRate: 4000,
          active: true
        }
      ],
      { from: lender }
    )


    //=== faucet asset
    await usdc.mint(lender, web3.utils.toWei('1000', 'mwei'), { from: lender })
    await usdc.approve(shopFactory.address, web3.utils.toWei('1000', 'mwei'), { from: lender })

    await usdc.mint(bidder1, web3.utils.toWei('1000', 'mwei'), { from: bidder1 })
    await usdc.approve(punkGateway.address, web3.utils.toWei('1000', 'mwei'), { from: bidder1 })

    await usdc.mint(bidder2, web3.utils.toWei('1000', 'mwei'), { from: bidder2 })
    await usdc.approve(punkGateway.address, web3.utils.toWei('1000', 'mwei'), { from: bidder2 })

    await usdc.mint(borrower, web3.utils.toWei('1000', 'mwei'), { from: borrower })
    await usdc.approve(punkGateway.address, web3.utils.toWei('1000', 'mwei'), { from: borrower })

    await cPunk.getPunk('1', { from: borrower });
    await cPunk.getPunk('2', { from: borrower });

    await cPunk.offerPunkForSaleToAddress('1', '0', punkGateway.address, { from: borrower });
    await cPunk.offerPunkForSaleToAddress('2', '0', punkGateway.address, { from: borrower });

    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)

    //setup loan duration = 1 seconds
    await provider.setMaxLoanDuration(1);
    //========================borrow USDC

    let borrowAmount1 = 10000000//10

    await wPunk.setApprovalForAll(punkGateway.address, true, { from: borrower });

    rs = await punkGateway.batchBorrow(
      '1',
      [usdc.address],
      [borrowAmount1],
      ['1'],
      borrower,
      { from: borrower }
    );

    let logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Borrow')

    let loanId1 = logs[0].loanId

    //verify borrower balance (+borrowAmount1)
    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], borrowAmount1, 0))

    //verify lender balance (-borrowAmount1)
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], 0, borrowAmount1))

    //verify owner nft (bnft)
    assert.isTrue(await utils.verifyOwnerNft(wPunk, 1, wPunkBnft.address))
    //======================= auction
    await utils.waitAndEvmMine(2000);

    //bidder1
    rs = await shopLoan.getNftLiquidatePrice(
      loanId1,
      { from: borrower }
    );
    let bidPrice = rs.liquidatePrice
    await punkGateway.auction(
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
    rs = await shopLoan.getNftAuctionData(
      loanId1,
      { from: bidder2 }
    );
    let lastBid = rs.bidPrice;
    bidPrice = rs.bidBorrowAmount.mul(new BN(110)).div(new BN(10000)).add(lastBid) //1.1%
    await punkGateway.auction(
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

    //============================= liquidate 
    await utils.waitAndEvmMine(1000);
    preBalances = await utils.logPreBalances(preBalances, usdc, testAddress)
    await provider.setRedeemDuration(0);
    await provider.setAuctionDuration(0);

    await wPunk.setApprovalForAll(punkGateway.address, true, { from: bidder2 });

    rs = await shopLoan.getNftDebtData(
      loanId1,
      { from: borrower }
    );
    let totalDebt = rs.totalDebt
    rs = await punkGateway.liquidate(
      loanId1,
      { from: bidder2 }
    );

    logs = utils.getResultFromLogs(Ishop, rs.receipt.rawLogs, 'Liquidate')
    let feeAmount = logs[0].feeAmount
    let remainAmount = logs[0].remainAmount

    //check loan status (Defaulted)
    assert.isTrue(await utils.verifyLoanState(shopLoan, loanId1, utils.LoanState.Defaulted))

    //verify owner nft (bidder2)
    assert.isTrue(await utils.verifyOwnerPunk(cPunk, 1, bidder2))

    //verify lender balance (+totalDebt - feeAmount)
    assert.isTrue(await utils.verifyBalance(usdc, lender, preBalances[lender], totalDebt, feeAmount))

    //verify borrower balance (+remainAmount)
    assert.isTrue(await utils.verifyBalance(usdc, borrower, preBalances[borrower], remainAmount, 0))

    //verify platformfee balance (+feeAmount)
    assert.isTrue(await utils.verifyBalance(usdc, platformFeeReceiver, preBalances[platformFeeReceiver], feeAmount, 0))

    return assert.isTrue(true);
  });
});

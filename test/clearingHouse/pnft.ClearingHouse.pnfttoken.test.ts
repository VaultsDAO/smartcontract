import { expect } from "chai"
import { parseEther } from "ethers/lib/utils"
import { waffle } from "hardhat"
import { MockPNFTToken } from "../../typechain/MockPNFTToken"
import { TestPNFTToken } from "../../typechain/TestPNFTToken"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"
describe("testPNFTToken test", () => {

    const [admin, addr1, addr2, ...addrs] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture: ClearingHouseFixture
    let testPNFTToken: TestPNFTToken

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())
        testPNFTToken = fixture.testPNFTToken

    })

    it("testPNFTToken test", async () => {
        let rs = await testPNFTToken.name();
        console.log(rs.toString());


        // "Test Token", "TT"

        let baseTime = 1622551248;
        let beneficiary = addr1;
        let startTime = baseTime;
        let cliff = 0;
        let duration = 1000;
        let slicePeriodSeconds = 1;
        let revokable = true;
        let unvestingAmount = 20;
        let amount = 100;


        // create new vesting schedule
        await testPNFTToken.createVestingSchedule(
            beneficiary.address,
            startTime,
            cliff,
            duration,
            slicePeriodSeconds,
            revokable,
            unvestingAmount,
            amount,
        );
        expect(await testPNFTToken.getVestingSchedulesCount()).to.be.equal(1);
        expect(
            await testPNFTToken.getVestingSchedulesCountByBeneficiary(
                beneficiary.address
            )
        ).to.be.equal(1);

        // compute vesting schedule id
        const vestingScheduleId =
            await testPNFTToken.computeVestingScheduleIdForAddressAndIndex(
                beneficiary.address,
                0
            );

        // check that vested amount is 0
        expect(
            await testPNFTToken.computeReleasableAmount(vestingScheduleId)
        ).to.be.equal(0);

        // set time to half the vesting period
        const halfTime = baseTime + duration / 2;
        await testPNFTToken.setCurrentTime(halfTime);

        // check that vested amount is half the total amount to vest
        expect(
            await testPNFTToken
                .connect(beneficiary)
                .computeReleasableAmount(vestingScheduleId)
        ).to.be.equal(50);

        // check that only beneficiary can try to release vested tokens
        await expect(
            testPNFTToken.connect(addr2).release(vestingScheduleId)
        ).to.be.revertedWith(
            "PNFTToken: only beneficiary and owner can release vested tokens"
        );


        // release 50 tokens and check that a Transfer event is emitted with a value of 50
        await testPNFTToken.connect(beneficiary).release(vestingScheduleId);

        let vestingSchedule = await testPNFTToken.getVestingSchedule(
            vestingScheduleId
        );
        let beneficiaryBalance = await testPNFTToken.balanceOf(beneficiary.address);
        expect(beneficiaryBalance).to.be.equal(70);

        // check that the released amount is 50
        expect(vestingSchedule.released).to.be.equal(50);

        // set current time after the end of the vesting period
        await testPNFTToken.setCurrentTime(baseTime + duration + 1);

        // check that the vested amount is 50
        expect(
            await testPNFTToken
                .connect(beneficiary)
                .computeReleasableAmount(vestingScheduleId)
        ).to.be.equal(50);

        // beneficiary release vested tokens (50)
        await testPNFTToken.connect(beneficiary).release(vestingScheduleId);
        beneficiaryBalance = await testPNFTToken.balanceOf(beneficiary.address);
        expect(beneficiaryBalance).to.be.equal(120);

        vestingSchedule = await testPNFTToken.getVestingSchedule(
            vestingScheduleId
        );

        // check that the number of released tokens is 100
        expect(vestingSchedule.released).to.be.equal(100);

        // check that the vested amount is 0
        expect(
            await testPNFTToken
                .connect(beneficiary)
                .computeReleasableAmount(vestingScheduleId)
        ).to.be.equal(0);

        // check that anyone cannot revoke a vesting
        await expect(
            testPNFTToken.connect(addr2).revoke(vestingScheduleId)
        ).to.be.revertedWith(" Ownable: caller is not the owner");
        await testPNFTToken.revoke(vestingScheduleId);


        // startTime = Math.floor(Date.now() / 1000);
        // cliff = 0;
        // duration = 5184000;//1440 days in seconds (4 years)
        // slicePeriodSeconds = 1296000;//360 days in seconds (1 year)
        // revokable = true;
        // console.log(unvestingAmount.toString());
        // console.log(amount.toString());
        // //add Core schedule 
        // await testPNFTToken.createVestingSchedule(
        //     testPNFTToken.address,
        //     startTime,
        //     cliff,
        //     duration,
        //     slicePeriodSeconds,
        //     revokable,
        //     parseEther("4000000"),
        //     parseEther("16000000"),
        // );
        // return;

    })
})

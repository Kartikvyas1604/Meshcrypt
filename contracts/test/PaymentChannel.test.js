const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PaymentChannel", function () {
  let paymentChannel;
  let bulletproofVerifier;
  let owner;
  let alice;
  let bob;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy BulletproofVerifier
    const BulletproofVerifier = await ethers.getContractFactory("BulletproofVerifier");
    bulletproofVerifier = await BulletproofVerifier.deploy();
    await bulletproofVerifier.waitForDeployment();

    // Deploy PaymentChannel
    const PaymentChannel = await ethers.getContractFactory("PaymentChannel");
    paymentChannel = await PaymentChannel.deploy(
      await bulletproofVerifier.getAddress()
    );
    await paymentChannel.waitForDeployment();
  });

  describe("Channel Opening", function () {
    it("Should open a new payment channel", async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("1.0");
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.connect(alice).openChannel(
          bob.address,
          commitment,
          proof,
          { value: deposit }
        )
      ).to.emit(paymentChannel, "ChannelOpened");
    });

    it("Should reject channel with zero participant", async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("1.0");
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.connect(alice).openChannel(
          ethers.ZeroAddress,
          commitment,
          proof,
          { value: deposit }
        )
      ).to.be.revertedWith("Invalid participant");
    });

    it("Should reject channel with zero deposit", async function () {
      const commitment = ethers.randomBytes(32);
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.connect(alice).openChannel(
          bob.address,
          commitment,
          proof,
          { value: 0 }
        )
      ).to.be.revertedWith("Deposit required");
    });

    it("Should reject channel with self as participant", async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("1.0");
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.connect(alice).openChannel(
          alice.address,
          commitment,
          proof,
          { value: deposit }
        )
      ).to.be.revertedWith("Cannot open channel with self");
    });
  });

  describe("Channel Deposits", function () {
    let channelId;

    beforeEach(async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("1.0");
      const proof = ethers.randomBytes(128);

      const tx = await paymentChannel.connect(alice).openChannel(
        bob.address,
        commitment,
        proof,
        { value: deposit }
      );
      const receipt = await tx.wait();
      channelId = receipt.logs[0].args.channelId;
    });

    it("Should allow deposits to existing channel", async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("0.5");
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.connect(bob).deposit(
          channelId,
          commitment,
          proof,
          { value: deposit }
        )
      ).to.emit(paymentChannel, "Deposited");
    });

    it("Should reject deposits to non-existent channel", async function () {
      const fakeChannelId = ethers.hexlify(ethers.randomBytes(32));
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("0.5");
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.connect(bob).deposit(
          fakeChannelId,
          commitment,
          proof,
          { value: deposit }
        )
      ).to.be.revertedWith("Channel not open");
    });

    it("Should reject deposits from non-participants", async function () {
      const [,, , nonParticipant] = await ethers.getSigners();
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("0.5");
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.connect(nonParticipant).deposit(
          channelId,
          commitment,
          proof,
          { value: deposit }
        )
      ).to.be.revertedWith("Not a participant");
    });
  });

  describe("Channel Updates", function () {
    let channelId;

    beforeEach(async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("1.0");
      const proof = ethers.randomBytes(128);

      const tx = await paymentChannel.connect(alice).openChannel(
        bob.address,
        commitment,
        proof,
        { value: deposit }
      );
      const receipt = await tx.wait();
      channelId = receipt.logs[0].args.channelId;
    });

    it("Should update channel state", async function () {
      const newCommitment = ethers.randomBytes(32);
      const nonce = 1;
      const sigAlice = ethers.randomBytes(65);
      const sigBob = ethers.randomBytes(65);
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.updateState(
          channelId,
          newCommitment,
          nonce,
          sigAlice,
          sigBob,
          proof
        )
      ).to.emit(paymentChannel, "StateUpdated");
    });

    it("Should reject update with invalid nonce", async function () {
      const newCommitment = ethers.randomBytes(32);
      const nonce = 0; // Should be > 0
      const sigAlice = ethers.randomBytes(65);
      const sigBob = ethers.randomBytes(65);
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.updateState(
          channelId,
          newCommitment,
          nonce,
          sigAlice,
          sigBob,
          proof
        )
      ).to.be.revertedWith("Invalid nonce");
    });
  });

  describe("Channel Closing", function () {
    let channelId;

    beforeEach(async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("1.0");
      const proof = ethers.randomBytes(128);

      const tx = await paymentChannel.connect(alice).openChannel(
        bob.address,
        commitment,
        proof,
        { value: deposit }
      );
      const receipt = await tx.wait();
      channelId = receipt.logs[0].args.channelId;
    });

    it("Should cooperatively close channel", async function () {
      const finalBalanceA = ethers.randomBytes(32);
      const finalBalanceB = ethers.randomBytes(32);
      const sigAlice = ethers.randomBytes(65);
      const sigBob = ethers.randomBytes(65);
      const proofA = ethers.randomBytes(128);
      const proofB = ethers.randomBytes(128);

      await expect(
        paymentChannel.cooperativeClose(
          channelId,
          finalBalanceA,
          finalBalanceB,
          sigAlice,
          sigBob,
          proofA,
          proofB
        )
      ).to.emit(paymentChannel, "ChannelClosed");
    });

    it("Should initiate unilateral close", async function () {
      const finalCommitment = ethers.randomBytes(32);
      const nonce = 1;
      const proof = ethers.randomBytes(128);

      await expect(
        paymentChannel.connect(alice).initiateClose(
          channelId,
          finalCommitment,
          nonce,
          proof
        )
      ).to.emit(paymentChannel, "CloseInitiated");
    });

    it("Should challenge during dispute period", async function () {
      const finalCommitment = ethers.randomBytes(32);
      const nonce = 1;
      const proof = ethers.randomBytes(128);

      await paymentChannel.connect(alice).initiateClose(
        channelId,
        finalCommitment,
        nonce,
        proof
      );

      const higherNonce = 2;
      const challengeCommitment = ethers.randomBytes(32);
      const sigAlice = ethers.randomBytes(65);
      const sigBob = ethers.randomBytes(65);
      const challengeProof = ethers.randomBytes(128);

      await expect(
        paymentChannel.challenge(
          channelId,
          challengeCommitment,
          higherNonce,
          sigAlice,
          sigBob,
          challengeProof
        )
      ).to.emit(paymentChannel, "ChannelChallenged");
    });

    it("Should finalize close after dispute period", async function () {
      const finalCommitment = ethers.randomBytes(32);
      const nonce = 1;
      const proof = ethers.randomBytes(128);

      await paymentChannel.connect(alice).initiateClose(
        channelId,
        finalCommitment,
        nonce,
        proof
      );

      // Move forward past dispute period (1 day)
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine");

      await expect(
        paymentChannel.finalizeClose(channelId)
      ).to.emit(paymentChannel, "ChannelClosed");
    });

    it("Should reject finalize before dispute period ends", async function () {
      const finalCommitment = ethers.randomBytes(32);
      const nonce = 1;
      const proof = ethers.randomBytes(128);

      await paymentChannel.connect(alice).initiateClose(
        channelId,
        finalCommitment,
        nonce,
        proof
      );

      await expect(
        paymentChannel.finalizeClose(channelId)
      ).to.be.revertedWith("Dispute period not ended");
    });
  });

  describe("Gas Optimization", function () {
    it("Should measure gas for opening channel", async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("1.0");
      const proof = ethers.randomBytes(128);

      const tx = await paymentChannel.connect(alice).openChannel(
        bob.address,
        commitment,
        proof,
        { value: deposit }
      );
      const receipt = await tx.wait();
      console.log("Open channel gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lessThan(200000);
    });

    it("Should measure gas for updating state", async function () {
      const commitment = ethers.randomBytes(32);
      const deposit = ethers.parseEther("1.0");
      const proof = ethers.randomBytes(128);

      const tx1 = await paymentChannel.connect(alice).openChannel(
        bob.address,
        commitment,
        proof,
        { value: deposit }
      );
      const receipt1 = await tx1.wait();
      const channelId = receipt1.logs[0].args.channelId;

      const newCommitment = ethers.randomBytes(32);
      const nonce = 1;
      const sigAlice = ethers.randomBytes(65);
      const sigBob = ethers.randomBytes(65);
      const updateProof = ethers.randomBytes(128);

      const tx2 = await paymentChannel.updateState(
        channelId,
        newCommitment,
        nonce,
        sigAlice,
        sigBob,
        updateProof
      );
      const receipt2 = await tx2.wait();
      console.log("Update state gas:", receipt2.gasUsed.toString());
      expect(receipt2.gasUsed).to.be.lessThan(150000);
    });
  });
});

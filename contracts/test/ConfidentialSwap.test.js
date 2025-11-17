const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ConfidentialSwap", function () {
  let confidentialSwap;
  let bulletproofVerifier;
  let owner;
  let user1;
  let user2;
  let feeCollector;

  beforeEach(async function () {
    [owner, user1, user2, feeCollector] = await ethers.getSigners();

    // Deploy BulletproofVerifier
    const BulletproofVerifier = await ethers.getContractFactory("BulletproofVerifier");
    bulletproofVerifier = await BulletproofVerifier.deploy();
    await bulletproofVerifier.waitForDeployment();

    // Deploy ConfidentialSwap
    const ConfidentialSwap = await ethers.getContractFactory("ConfidentialSwap");
    confidentialSwap = await ConfidentialSwap.deploy(
      await bulletproofVerifier.getAddress(),
      feeCollector.address
    );
    await confidentialSwap.waitForDeployment();
  });

  describe("Pool Creation", function () {
    it("Should create a new liquidity pool", async function () {
      const tokenA = ethers.Wallet.createRandom().address;
      const tokenB = ethers.Wallet.createRandom().address;

      await expect(
        confidentialSwap.createPool(tokenA, tokenB)
      ).to.emit(confidentialSwap, "PoolCreated");

      const poolId = ethers.solidityPackedKeccak256(["address", "address"], [tokenA, tokenB]);
      const pool = await confidentialSwap.pools(poolId);
      expect(pool.tokenA).to.equal(tokenA);
      expect(pool.tokenB).to.equal(tokenB);
    });

    it("Should fail to create duplicate pool", async function () {
      const tokenA = ethers.Wallet.createRandom().address;
      const tokenB = ethers.Wallet.createRandom().address;

      await confidentialSwap.createPool(tokenA, tokenB);
      await expect(
        confidentialSwap.createPool(tokenA, tokenB)
      ).to.be.revertedWith("Pool already exists");
    });

    it("Should reject zero addresses", async function () {
      await expect(
        confidentialSwap.createPool(ethers.ZeroAddress, ethers.Wallet.createRandom().address)
      ).to.be.revertedWith("Invalid token addresses");
    });
  });

  describe("Liquidity Operations", function () {
    let poolId;
    let tokenA;
    let tokenB;

    beforeEach(async function () {
      tokenA = ethers.Wallet.createRandom().address;
      tokenB = ethers.Wallet.createRandom().address;
      await confidentialSwap.createPool(tokenA, tokenB);
      poolId = ethers.solidityPackedKeccak256(["address", "address"], [tokenA, tokenB]);
    });

    it("Should add liquidity to pool", async function () {
      const commitmentA = ethers.randomBytes(32);
      const commitmentB = ethers.randomBytes(32);
      const proofA = ethers.randomBytes(128);
      const proofB = ethers.randomBytes(128);

      await expect(
        confidentialSwap.addLiquidity(poolId, commitmentA, commitmentB, proofA, proofB)
      ).to.emit(confidentialSwap, "LiquidityAdded");
    });

    it("Should remove liquidity from pool", async function () {
      const commitmentA = ethers.randomBytes(32);
      const commitmentB = ethers.randomBytes(32);
      const proofA = ethers.randomBytes(128);
      const proofB = ethers.randomBytes(128);

      await confidentialSwap.addLiquidity(poolId, commitmentA, commitmentB, proofA, proofB);

      await expect(
        confidentialSwap.removeLiquidity(poolId, commitmentA, commitmentB, proofA, proofB)
      ).to.emit(confidentialSwap, "LiquidityRemoved");
    });

    it("Should reject liquidity with invalid proofs", async function () {
      const commitmentA = ethers.randomBytes(32);
      const commitmentB = ethers.randomBytes(32);
      const invalidProof = new Uint8Array(128); // All zeros

      await expect(
        confidentialSwap.addLiquidity(poolId, commitmentA, commitmentB, invalidProof, invalidProof)
      ).to.be.revertedWith("Invalid range proof");
    });
  });

  describe("Swap Operations", function () {
    let poolId;
    let tokenA;
    let tokenB;

    beforeEach(async function () {
      tokenA = ethers.Wallet.createRandom().address;
      tokenB = ethers.Wallet.createRandom().address;
      await confidentialSwap.createPool(tokenA, tokenB);
      poolId = ethers.solidityPackedKeccak256(["address", "address"], [tokenA, tokenB]);

      // Add initial liquidity
      const commitmentA = ethers.randomBytes(32);
      const commitmentB = ethers.randomBytes(32);
      const proofA = ethers.randomBytes(128);
      const proofB = ethers.randomBytes(128);
      await confidentialSwap.addLiquidity(poolId, commitmentA, commitmentB, proofA, proofB);
    });

    it("Should commit to a swap", async function () {
      const commitment = ethers.randomBytes(32);
      await expect(
        confidentialSwap.commitSwap(poolId, commitment)
      ).to.emit(confidentialSwap, "SwapCommitted");
    });

    it("Should execute swap after commitment", async function () {
      const commitment = ethers.randomBytes(32);
      const amountIn = ethers.randomBytes(32);
      const amountOut = ethers.randomBytes(32);
      const proof = ethers.randomBytes(128);

      await confidentialSwap.commitSwap(poolId, commitment);

      // Move forward in time past reveal period
      await ethers.provider.send("evm_increaseTime", [301]);
      await ethers.provider.send("evm_mine");

      await expect(
        confidentialSwap.executeSwap(poolId, amountIn, amountOut, proof)
      ).to.emit(confidentialSwap, "SwapExecuted");
    });

    it("Should fail to execute without commitment", async function () {
      const amountIn = ethers.randomBytes(32);
      const amountOut = ethers.randomBytes(32);
      const proof = ethers.randomBytes(128);

      await expect(
        confidentialSwap.executeSwap(poolId, amountIn, amountOut, proof)
      ).to.be.revertedWith("No active commitment");
    });

    it("Should fail to execute during reveal period", async function () {
      const commitment = ethers.randomBytes(32);
      const amountIn = ethers.randomBytes(32);
      const amountOut = ethers.randomBytes(32);
      const proof = ethers.randomBytes(128);

      await confidentialSwap.commitSwap(poolId, commitment);

      await expect(
        confidentialSwap.executeSwap(poolId, amountIn, amountOut, proof)
      ).to.be.revertedWith("Still in reveal period");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to pause", async function () {
      await confidentialSwap.pause();
      expect(await confidentialSwap.paused()).to.be.true;
    });

    it("Should allow owner to unpause", async function () {
      await confidentialSwap.pause();
      await confidentialSwap.unpause();
      expect(await confidentialSwap.paused()).to.be.false;
    });

    it("Should reject non-owner pause", async function () {
      await expect(
        confidentialSwap.connect(user1).pause()
      ).to.be.revertedWithCustomError(confidentialSwap, "OwnableUnauthorizedAccount");
    });

    it("Should update fee collector", async function () {
      const newCollector = ethers.Wallet.createRandom().address;
      await confidentialSwap.setFeeCollector(newCollector);
      expect(await confidentialSwap.feeCollector()).to.equal(newCollector);
    });

    it("Should prevent operations when paused", async function () {
      await confidentialSwap.pause();
      const tokenA = ethers.Wallet.createRandom().address;
      const tokenB = ethers.Wallet.createRandom().address;

      await expect(
        confidentialSwap.createPool(tokenA, tokenB)
      ).to.be.revertedWithCustomError(confidentialSwap, "EnforcedPause");
    });
  });

  describe("Gas Optimization", function () {
    it("Should measure gas for pool creation", async function () {
      const tokenA = ethers.Wallet.createRandom().address;
      const tokenB = ethers.Wallet.createRandom().address;
      const tx = await confidentialSwap.createPool(tokenA, tokenB);
      const receipt = await tx.wait();
      console.log("Pool creation gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lessThan(200000);
    });

    it("Should measure gas for adding liquidity", async function () {
      const tokenA = ethers.Wallet.createRandom().address;
      const tokenB = ethers.Wallet.createRandom().address;
      await confidentialSwap.createPool(tokenA, tokenB);
      const poolId = ethers.solidityPackedKeccak256(["address", "address"], [tokenA, tokenB]);

      const commitmentA = ethers.randomBytes(32);
      const commitmentB = ethers.randomBytes(32);
      const proofA = ethers.randomBytes(128);
      const proofB = ethers.randomBytes(128);

      const tx = await confidentialSwap.addLiquidity(poolId, commitmentA, commitmentB, proofA, proofB);
      const receipt = await tx.wait();
      console.log("Add liquidity gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lessThan(300000);
    });
  });
});

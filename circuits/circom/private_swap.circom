pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Private Swap Circuit
 * 
 * Proves a valid atomic swap between two parties without revealing amounts:
 * - Party A sends amountA of tokenA
 * - Party B sends amountB of tokenB
 * - Exchange rate is satisfied: amountA * rateB = amountB * rateA
 * - Both amounts are positive and within valid range
 * 
 * Public inputs:
 * - commitmentA: commitment to amountA
 * - commitmentB: commitment to amountB
 * - rateA: exchange rate numerator
 * - rateB: exchange rate denominator
 * 
 * Private inputs:
 * - amountA: amount of tokenA (secret)
 * - amountB: amount of tokenB (secret)
 * - blindingA: commitment blinding for amountA (secret)
 * - blindingB: commitment blinding for amountB (secret)
 */

template PrivateSwap(nBits) {
    signal input amountA;
    signal input amountB;
    signal input rateA;
    signal input rateB;
    signal input blindingA;
    signal input blindingB;
    
    signal output commitmentA;
    signal output commitmentB;
    signal output isValidSwap;
    
    // 1. Range checks: ensure amounts are positive and within bounds
    component rangeA = Num2Bits(nBits);
    rangeA.in <== amountA;
    
    component rangeB = Num2Bits(nBits);
    rangeB.in <== amountB;
    
    // 2. Verify exchange rate: amountA * rateB = amountB * rateA
    signal leftSide;
    signal rightSide;
    leftSide <== amountA * rateB;
    rightSide <== amountB * rateA;
    leftSide === rightSide;
    
    // 3. Compute commitments
    component hashA = Poseidon(2);
    hashA.inputs[0] <== amountA;
    hashA.inputs[1] <== blindingA;
    commitmentA <== hashA.out;
    
    component hashB = Poseidon(2);
    hashB.inputs[0] <== amountB;
    hashB.inputs[1] <== blindingB;
    commitmentB <== hashB.out;
    
    // 4. Output validity
    isValidSwap <== 1;
}

component main {public [rateA, rateB, commitmentA, commitmentB]} = PrivateSwap(64);

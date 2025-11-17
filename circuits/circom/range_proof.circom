pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Range Proof Circuit
 * 
 * Proves that a committed value is within a specified range [min, max]
 * without revealing the actual value. Essential for preventing negative
 * amounts and overflow attacks.
 * 
 * Public inputs:
 * - commitment: Pedersen commitment to the value
 * - min: minimum allowed value
 * - max: maximum allowed value
 * 
 * Private inputs:
 * - value: actual value (secret)
 * - blinding: commitment blinding factor (secret)
 */

template RangeProof(nBits) {
    signal input value;
    signal input blinding;
    signal input min;
    signal input max;
    
    signal output commitment;
    signal output inRange;
    
    // 1. Prove value is in valid bit range [0, 2^nBits - 1]
    component valueBits = Num2Bits(nBits);
    valueBits.in <== value;
    
    // 2. Prove value >= min
    component geMin = GreaterEqThan(nBits);
    geMin.in[0] <== value;
    geMin.in[1] <== min;
    signal checkMin;
    checkMin <== geMin.out;
    checkMin === 1;
    
    // 3. Prove value <= max
    component leMax = LessEqThan(nBits);
    leMax.in[0] <== value;
    leMax.in[1] <== max;
    signal checkMax;
    checkMax <== leMax.out;
    checkMax === 1;
    
    // 4. Compute commitment (simplified Pedersen)
    // Real implementation would use proper elliptic curve operations
    commitment <== value * 1000000 + blinding;
    
    // 5. Output range validity
    inRange <== checkMin * checkMax;
}

component main {public [min, max, commitment]} = RangeProof(64);

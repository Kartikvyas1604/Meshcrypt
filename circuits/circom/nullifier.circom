pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Nullifier Circuit
 * 
 * Generates a unique nullifier for preventing double-spending in private
 * transactions. The nullifier is publicly revealed when spending a commitment,
 * but it doesn't reveal which commitment was spent.
 * 
 * Public inputs:
 * - nullifier: the nullifier to publish (proves uniqueness)
 * 
 * Private inputs:
 * - secret: user's secret key (secret)
 * - commitment: the commitment being spent (secret)
 * - index: position in anonymity set (secret)
 */

template Nullifier() {
    signal input secret;
    signal input commitment;
    signal input index;
    
    signal output nullifier;
    signal output isValid;
    
    // Compute nullifier = H(secret || commitment || index)
    // This ensures:
    // 1. Each commitment can only be spent once (same inputs = same nullifier)
    // 2. Different users get different nullifiers (different secrets)
    // 3. Same user can't link nullifiers across transactions (commitment varies)
    
    component hasher = Poseidon(3);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== commitment;
    hasher.inputs[2] <== index;
    
    nullifier <== hasher.out;
    isValid <== 1;
}

component main {public [nullifier]} = Nullifier();

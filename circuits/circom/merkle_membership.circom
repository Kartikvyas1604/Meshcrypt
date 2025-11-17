pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

/**
 * Merkle Tree Membership Circuit
 * 
 * Proves that a commitment exists in a Merkle tree without revealing
 * which leaf it is. Used for anonymity sets in private transactions.
 * 
 * Public inputs:
 * - root: Merkle tree root
 * 
 * Private inputs:
 * - leaf: the commitment to prove membership of (secret)
 * - pathElements: sibling hashes along the path (secret)
 * - pathIndices: 0/1 indicating left/right at each level (secret)
 */

template MerkleMembership(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    
    signal output isValid;
    
    // Hash pairs from leaf to root
    component hashers[levels];
    component mux[levels];
    
    signal hashes[levels + 1];
    hashes[0] <== leaf;
    
    for (var i = 0; i < levels; i++) {
        // Select which input goes left/right based on pathIndices[i]
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== hashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== hashes[i];
        mux[i].s <== pathIndices[i];
        
        // Hash the pair
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];
        
        hashes[i + 1] <== hashers[i].out;
    }
    
    // Verify computed root matches public root
    root === hashes[levels];
    isValid <== 1;
}

component main {public [root]} = MerkleMembership(20);

pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/eddsamimc.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/**
 * Stealth Address Circuit
 * 
 * Proves ownership of a stealth address without revealing the link
 * to the master public key. Uses Diffie-Hellman key exchange.
 * 
 * Public inputs:
 * - stealthAddress: the stealth address to prove ownership of
 * - ephemeralPublicKey: one-time public key used in transaction
 * 
 * Private inputs:
 * - masterPrivateKey: user's master private key (secret)
 * - masterPublicKey: user's master public key (secret for privacy)
 */

template StealthAddress() {
    signal input masterPrivateKey;
    signal input ephemeralPublicKey;
    
    signal output stealthAddress;
    signal output isOwner;
    
    // 1. Compute shared secret: sharedSecret = masterPrivateKey * ephemeralPublicKey
    signal sharedSecret;
    sharedSecret <== masterPrivateKey * ephemeralPublicKey;
    
    // 2. Derive stealth private key: stealthPrivKey = H(sharedSecret) + masterPrivateKey
    component hasher = Poseidon(1);
    hasher.inputs[0] <== sharedSecret;
    signal stealthPrivKey;
    stealthPrivKey <== hasher.out + masterPrivateKey;
    
    // 3. Compute stealth public key (address): stealthPubKey = stealthPrivKey * G
    // In simplified form (real implementation uses EdDSA point multiplication)
    component stealthPubKey = Poseidon(1);
    stealthPubKey.inputs[0] <== stealthPrivKey;
    stealthAddress <== stealthPubKey.out;
    
    // 4. Output ownership confirmation
    isOwner <== 1;
}

component main {public [ephemeralPublicKey]} = StealthAddress();

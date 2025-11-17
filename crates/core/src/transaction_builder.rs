//! Transaction Builder
//!
//! Constructs private transactions with Pedersen commitments and range proofs.

use crate::{
    CoreError, Result,
    commitments::{PedersenCommitment, Commitment, RangeProof, random_scalar},
};
use curve25519_dalek::scalar::Scalar;
use curve25519_dalek::traits::IsIdentity;
use serde::{Serialize, Deserialize};
use rand::Rng;

/// Private transaction with hidden amounts
#[derive(Clone, Serialize, Deserialize)]
pub struct PrivateTransaction {
    /// Transaction inputs (UTXOs or account references)
    pub inputs: Vec<TransactionInput>,
    /// Transaction outputs
    pub outputs: Vec<TransactionOutput>,
    /// Range proofs for outputs (prove amounts are positive)
    pub range_proofs: Vec<RangeProof>,
    /// Transaction fee (revealed for miners)
    pub fee: u64,
    /// Optional metadata
    pub metadata: Option<Vec<u8>>,
}

impl PrivateTransaction {
    /// Verify transaction validity
    pub fn verify(&self) -> Result<bool> {
        // 1. Verify input-output balance equation
        if !self.verify_balance()? {
            return Ok(false);
        }
        
        // 2. Verify all range proofs
        for (i, proof) in self.range_proofs.iter().enumerate() {
            if i >= self.outputs.len() {
                return Err(CoreError::InvalidParameter("Too many range proofs".into()));
            }
            
            let output = &self.outputs[i];
            if !proof.verify(&output.commitment) {
                return Ok(false);
            }
        }
        
        // 3. Verify signatures on inputs (would check UTXO ownership)
        // TODO: Add signature verification
        
        Ok(true)
    }
    
    /// Verify balance equation: sum(inputs) = sum(outputs) + fee
    fn verify_balance(&self) -> Result<bool> {
        let pc = PedersenCommitment::new();
        
        // Sum input commitments
        let mut input_commitments: Vec<&Commitment> = Vec::new();
        for input in &self.inputs {
            input_commitments.push(&input.commitment);
        }
        
        // Sum output commitments
        let mut output_commitments: Vec<&Commitment> = Vec::new();
        for output in &self.outputs {
            output_commitments.push(&output.commitment);
        }
        
        // Add fee commitment (fee has blinding factor 0)
        let fee_commitment = pc.commit(self.fee, &Scalar::ZERO);
        output_commitments.push(&fee_commitment);
        
        // Compute: sum(inputs) - sum(outputs) - fee
        // This should equal commitment to zero
        if input_commitments.is_empty() || output_commitments.is_empty() {
            return Ok(false);
        }
        
        let mut result = input_commitments[0].clone();
        for i in 1..input_commitments.len() {
            result = PedersenCommitment::add_commitments(&result, input_commitments[i]);
        }
        
        for output_c in output_commitments {
            result = PedersenCommitment::subtract_commitments(&result, output_c);
        }
        
        // Check if result is commitment to zero
        // For a proper commitment to zero, point should be identity
        Ok(result.point.is_identity())
    }
    
    /// Serialize to bytes for transmission
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        bincode::serialize(self)
            .map_err(|e| CoreError::Serialization(format!("Failed to serialize transaction: {}", e)))
    }
    
    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        bincode::deserialize(bytes)
            .map_err(|e| CoreError::Serialization(format!("Failed to deserialize transaction: {}", e)))
    }
}

/// Transaction input (UTXO reference)
#[derive(Clone, Serialize, Deserialize)]
pub struct TransactionInput {
    /// Previous transaction hash
    pub prev_tx_hash: [u8; 32],
    /// Output index in previous transaction
    pub prev_output_index: u32,
    /// Commitment to input amount (hidden)
    pub commitment: Commitment,
    /// Signature proving ownership (would be actual signature)
    pub signature: Vec<u8>,
}

/// Transaction output
#[derive(Clone, Serialize, Deserialize)]
pub struct TransactionOutput {
    /// Destination address (could be stealth address)
    pub address: Vec<u8>,
    /// Commitment to output amount (hidden)
    pub commitment: Commitment,
    /// Optional encrypted amount (for recipient only)
    pub encrypted_amount: Option<Vec<u8>>,
}

/// Transaction builder - helps construct private transactions
pub struct TransactionBuilder {
    pedersen: PedersenCommitment,
    inputs: Vec<BuilderInput>,
    outputs: Vec<BuilderOutput>,
    fee: u64,
    metadata: Option<Vec<u8>>,
}

#[derive(Clone)]
struct BuilderInput {
    prev_tx_hash: [u8; 32],
    prev_output_index: u32,
    value: u64,
    blinding: Scalar,
    commitment: Commitment,
}

#[derive(Clone)]
struct BuilderOutput {
    address: Vec<u8>,
    value: u64,
    blinding: Scalar,
    commitment: Commitment,
}

impl TransactionBuilder {
    /// Create new transaction builder
    pub fn new() -> Self {
        TransactionBuilder {
            pedersen: PedersenCommitment::new(),
            inputs: Vec::new(),
            outputs: Vec::new(),
            fee: 0,
            metadata: None,
        }
    }
    
    /// Add input to transaction
    pub fn add_input(
        &mut self,
        prev_tx_hash: [u8; 32],
        prev_output_index: u32,
        value: u64,
        blinding: Scalar,
    ) -> &mut Self {
        let commitment = self.pedersen.commit(value, &blinding);
        
        self.inputs.push(BuilderInput {
            prev_tx_hash,
            prev_output_index,
            value,
            blinding,
            commitment,
        });
        
        self
    }
    
    /// Add output to transaction with random blinding
    /// WARNING: For the last output, use add_output_with_blinding() with calculate_change_blinding()
    /// to ensure the transaction balances correctly!
    pub fn add_output(
        &mut self,
        address: Vec<u8>,
        value: u64,
    ) -> &mut Self {
        // Generate random blinding factor for output
        let blinding = random_scalar();
        self.add_output_with_blinding(address, value, blinding)
    }
    
    /// Add output with specific blinding factor
    /// Use this for the change output with calculate_change_blinding()
    pub fn add_output_with_blinding(
        &mut self,
        address: Vec<u8>,
        value: u64,
        blinding: Scalar,
    ) -> &mut Self {
        let commitment = self.pedersen.commit(value, &blinding);
        
        self.outputs.push(BuilderOutput {
            address,
            value,
            blinding,
            commitment,
        });
        
        self
    }
    
    /// Set transaction fee
    pub fn set_fee(&mut self, fee: u64) -> &mut Self {
        self.fee = fee;
        self
    }
    
    /// Set optional metadata
    pub fn set_metadata(&mut self, metadata: Vec<u8>) -> &mut Self {
        self.metadata = Some(metadata);
        self
    }
    
    /// Build and sign transaction
    pub fn build(&self) -> Result<PrivateTransaction> {
        // Verify balance before building
        let total_input: u64 = self.inputs.iter().map(|i| i.value).sum();
        let total_output: u64 = self.outputs.iter().map(|o| o.value).sum();
        
        if total_input != total_output + self.fee {
            return Err(CoreError::InvalidParameter(
                format!("Unbalanced transaction: inputs={}, outputs={}, fee={}", 
                    total_input, total_output, self.fee)
            ));
        }
        
        // Convert builder inputs to transaction inputs
        let inputs: Vec<TransactionInput> = self.inputs.iter().map(|i| {
            TransactionInput {
                prev_tx_hash: i.prev_tx_hash,
                prev_output_index: i.prev_output_index,
                commitment: i.commitment.clone(),
                signature: Vec::new(), // TODO: Actually sign
            }
        }).collect();
        
        // Convert builder outputs to transaction outputs
        let outputs: Vec<TransactionOutput> = self.outputs.iter().map(|o| {
            TransactionOutput {
                address: o.address.clone(),
                commitment: o.commitment.clone(),
                encrypted_amount: None, // TODO: Encrypt for recipient
            }
        }).collect();
        
        // Generate range proofs for each output
        let range_proofs: Vec<RangeProof> = self.outputs.iter()
            .map(|o| RangeProof::prove(o.value, &o.blinding, 64))
            .collect::<Result<Vec<_>>>()?;
        
        Ok(PrivateTransaction {
            inputs,
            outputs,
            range_proofs,
            fee: self.fee,
            metadata: self.metadata.clone(),
        })
    }
    
    /// Calculate required blinding factor for change output
    /// 
    /// To maintain balance: sum(input_blindings) = sum(output_blindings)
    /// Change blinding = sum(input_blindings) - sum(other_output_blindings)
    pub fn calculate_change_blinding(&self) -> Scalar {
        let input_sum: Scalar = self.inputs.iter()
            .fold(Scalar::ZERO, |acc, i| acc + i.blinding);
        
        let output_sum: Scalar = self.outputs.iter()
            .fold(Scalar::ZERO, |acc, o| acc + o.blinding);
        
        input_sum - output_sum
    }
    
    /// Estimate transaction size (for fee calculation)
    pub fn estimate_size(&self) -> usize {
        // Rough estimate:
        // - Each input: ~150 bytes (32 hash + 4 index + 32 commitment + 64 signature + padding)
        // - Each output: ~100 bytes (32 address + 32 commitment + padding)
        // - Each range proof: ~650 bytes (Bulletproofs)
        // - Overhead: ~50 bytes
        
        let input_size = self.inputs.len() * 150;
        let output_size = self.outputs.len() * 100;
        let proof_size = self.outputs.len() * 650;
        let overhead = 50;
        
        input_size + output_size + proof_size + overhead
    }
}

impl Default for TransactionBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// UTXO (Unspent Transaction Output) representation
#[derive(Clone, Serialize, Deserialize)]
pub struct UTXO {
    pub tx_hash: [u8; 32],
    pub output_index: u32,
    pub value: u64,
    pub commitment: Commitment,
    pub blinding: Scalar,
    pub address: Vec<u8>,
}

impl UTXO {
    /// Create new UTXO
    pub fn new(
        tx_hash: [u8; 32],
        output_index: u32,
        value: u64,
        commitment: Commitment,
        blinding: Scalar,
        address: Vec<u8>,
    ) -> Self {
        UTXO {
            tx_hash,
            output_index,
            value,
            commitment,
            blinding,
            address,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::random_scalar;
    
    #[test]
    fn test_simple_transaction() {
        let mut builder = TransactionBuilder::new();
        
        // Input: 100 coins
        let input_blinding = random_scalar();
        builder.add_input([0u8; 32], 0, 100, input_blinding);
        
        // Output: 80 coins to recipient (random blinding)
        builder.add_output(vec![1, 2, 3, 4], 80);
        
        // Change: 10 coins back to sender (needs calculated blinding for balance)
        // First calculate what blinding we need
        let change_blinding = builder.calculate_change_blinding();
        let change_commitment = builder.pedersen.commit(10, &change_blinding);
        builder.outputs.push(BuilderOutput {
            address: vec![5, 6, 7, 8],
            value: 10,
            blinding: change_blinding,
            commitment: change_commitment,
        });
        
        // Fee: 10 coins
        builder.set_fee(10);
        
        let tx = builder.build().unwrap();
        
        assert_eq!(tx.inputs.len(), 1);
        assert_eq!(tx.outputs.len(), 2);
        assert_eq!(tx.fee, 10);
        
        // Verify transaction
        assert!(tx.verify().unwrap());
    }
    
    #[test]
    fn test_multi_input_transaction() {
        let mut builder = TransactionBuilder::new();
        
        // Multiple inputs
        let blinding1 = random_scalar();
        let blinding2 = random_scalar();
        
        builder.add_input([1u8; 32], 0, 50, blinding1);
        builder.add_input([2u8; 32], 1, 75, blinding2);
        
        // Fee
        builder.set_fee(5);
        
        // Single output (must use calculated blinding for balance)
        let output_blinding = builder.calculate_change_blinding();
        let pc = PedersenCommitment::new();
        let output_commitment = pc.commit(120, &output_blinding);
        builder.outputs.push(BuilderOutput {
            address: vec![1, 2, 3, 4],
            value: 120,
            blinding: output_blinding,
            commitment: output_commitment,
        });
        
        let tx = builder.build().unwrap();
        
        assert_eq!(tx.inputs.len(), 2);
        assert_eq!(tx.outputs.len(), 1);
        
        // Verify balance
        assert!(tx.verify().unwrap());
    }
    
    #[test]
    fn test_unbalanced_transaction_fails() {
        let mut builder = TransactionBuilder::new();
        
        let blinding = random_scalar();
        builder.add_input([0u8; 32], 0, 100, blinding);
        
        // Output more than input (should fail)
        builder.add_output(vec![1, 2, 3, 4], 150);
        builder.set_fee(0);
        
        let result = builder.build();
        assert!(result.is_err());
    }
    
    #[test]
    fn test_transaction_serialization() {
        let mut builder = TransactionBuilder::new();
        
        let blinding = random_scalar();
        builder.add_input([0u8; 32], 0, 100, blinding);
        builder.add_output(vec![1, 2, 3, 4], 90);
        builder.set_fee(10);
        
        let tx = builder.build().unwrap();
        
        // Serialize and deserialize
        let bytes = tx.to_bytes().unwrap();
        let deserialized = PrivateTransaction::from_bytes(&bytes).unwrap();
        
        assert_eq!(tx.inputs.len(), deserialized.inputs.len());
        assert_eq!(tx.outputs.len(), deserialized.outputs.len());
        assert_eq!(tx.fee, deserialized.fee);
    }
    
    #[test]
    fn test_estimate_size() {
        let mut builder = TransactionBuilder::new();
        
        let blinding = random_scalar();
        builder.add_input([0u8; 32], 0, 100, blinding);
        builder.add_output(vec![1, 2, 3, 4], 90);
        builder.set_fee(10);
        
        let size = builder.estimate_size();
        
        // Should be around: 150 (input) + 100 (output) + 650 (proof) + 50 (overhead) = ~950 bytes
        assert!(size > 800 && size < 1100);
    }
    
    #[test]
    fn test_change_blinding_calculation() {
        let mut builder = TransactionBuilder::new();
        
        let input_blinding = random_scalar();
        builder.add_input([0u8; 32], 0, 100, input_blinding);
        
        // Add first output - this will have a random blinding
        builder.add_output(vec![1, 2, 3, 4], 90);
        
        // Calculate what the change blinding should be to balance
        let change_blinding = builder.calculate_change_blinding();
        
        // Manually add change output with the calculated blinding
        let pc = PedersenCommitment::new();
        let change_commitment = pc.commit(5, &change_blinding);
        builder.outputs.push(BuilderOutput {
            address: vec![5, 6, 7, 8],
            value: 5,
            blinding: change_blinding,
            commitment: change_commitment,
        });
        
        builder.set_fee(5);
        
        let tx = builder.build().unwrap();
        assert!(tx.verify().unwrap());
    }
}

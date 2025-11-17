//! Stealth Address Protocol
//!
//! Implements stealth addresses for recipient privacy using Elliptic Curve Diffie-Hellman.
//! This allows senders to generate one-time addresses for recipients without interaction.

use curve25519_dalek::{
    ristretto::{CompressedRistretto, RistrettoPoint},
    scalar::Scalar,
    constants::RISTRETTO_BASEPOINT_POINT as G,
};
use serde::{Deserialize, Serialize};
use zeroize::ZeroizeOnDrop;
use rand::Rng;
use crate::{CoreError, Result};

/// Stealth address master keypair
/// 
/// Consists of:
/// - Spend keypair (s, S = s·G) - Used to spend funds
/// - View keypair (v, V = v·G) - Used to scan for incoming transactions
#[derive(Clone, ZeroizeOnDrop)]
pub struct StealthMasterKey {
    /// Spend private key (kept secret, used to spend)
    pub spend_private: Scalar,
    /// Spend public key (shared publicly)
    pub spend_public: RistrettoPoint,
    /// View private key (kept secret, used to scan)
    pub view_private: Scalar,
    /// View public key (shared publicly)
    pub view_public: RistrettoPoint,
}

impl StealthMasterKey {
    /// Generate a new stealth master keypair
    pub fn generate() -> Self {
        let mut spend_bytes = [0u8; 32];
        let mut view_bytes = [0u8; 32];
        rand::thread_rng().fill(&mut spend_bytes);
        rand::thread_rng().fill(&mut view_bytes);
        
        let spend_private = Scalar::from_bytes_mod_order(spend_bytes);
        let spend_public = spend_private * G;
        
        let view_private = Scalar::from_bytes_mod_order(view_bytes);
        let view_public = view_private * G;
        
        StealthMasterKey {
            spend_private,
            spend_public,
            view_private,
            view_public,
        }
    }
    
    /// Create from existing keys (for wallet restoration)
    pub fn from_keys(
        spend_private: Scalar,
        view_private: Scalar,
    ) -> Self {
        let spend_public = spend_private * G;
        let view_public = view_private * G;
        
        StealthMasterKey {
            spend_private,
            spend_public,
            view_private,
            view_public,
        }
    }
    
    /// Export spend private key (for backup)
    pub fn export_spend_private(&self) -> [u8; 32] {
        self.spend_private.to_bytes()
    }
    
    /// Export view private key (can be shared with auditors for read-only access)
    pub fn export_view_private(&self) -> [u8; 32] {
        self.view_private.to_bytes()
    }
    
    /// Get stealth address (S, V) to share with senders
    pub fn get_stealth_address(&self) -> StealthAddress {
        StealthAddress {
            spend_public: self.spend_public,
            view_public: self.view_public,
        }
    }
    
    /// Scan transaction to check if output belongs to us
    ///
    /// Algorithm:
    /// 1. Compute shared secret: σ = v·R (view_private * ephemeral_public)
    /// 2. Hash to scalar: h = H(σ)
    /// 3. Compute expected public key: P' = h·G + S
    /// 4. If P' == P, this output belongs to us
    /// 5. Derive private key: p = h + s
    pub fn scan_transaction(
        &self,
        ephemeral_public: &RistrettoPoint,
        output_public: &RistrettoPoint,
    ) -> Option<Scalar> {
        // Compute shared secret
        let shared_secret = self.view_private * ephemeral_public;
        
        // Hash shared secret to scalar
        let hash_scalar = Self::hash_to_scalar(shared_secret.compress().as_bytes());
        
        // Check if output belongs to us
        let expected_public = hash_scalar * G + self.spend_public;
        
        if expected_public == *output_public {
            // Derive private key for this output
            let output_private = hash_scalar + self.spend_private;
            Some(output_private)
        } else {
            None
        }
    }
    
    /// Hash bytes to scalar using BLAKE2b
    fn hash_to_scalar(data: &[u8]) -> Scalar {
        use blake2::{Blake2b512, Digest};
        let hash = Blake2b512::digest(data);
        let mut hash_bytes = [0u8; 64];
        hash_bytes.copy_from_slice(hash.as_slice());
        Scalar::from_bytes_mod_order_wide(&hash_bytes)
    }
}

/// Stealth address (public keys only, safe to share)
#[derive(Clone, Serialize, Deserialize)]
pub struct StealthAddress {
    pub spend_public: RistrettoPoint,
    pub view_public: RistrettoPoint,
}

impl StealthAddress {
    /// Generate one-time stealth address for this recipient
    ///
    /// Algorithm:
    /// 1. Generate ephemeral keypair: (r, R = r·G)
    /// 2. Compute shared secret: σ = r·V (ephemeral_private * view_public)
    /// 3. Hash to scalar: h = H(σ)
    /// 4. Derive one-time public key: P = h·G + S
    /// 5. Return (R, P) - sender includes R in transaction, sends to P
    pub fn generate_one_time_address(&self) -> StealthTransaction {
        // Generate ephemeral keypair
        let mut ephemeral_bytes = [0u8; 32];
        rand::thread_rng().fill(&mut ephemeral_bytes);
        let ephemeral_private = Scalar::from_bytes_mod_order(ephemeral_bytes);
        let ephemeral_public = ephemeral_private * G;
        
        // Compute shared secret
        let shared_secret = ephemeral_private * self.view_public;
        
        // Hash to scalar
        let hash_scalar = StealthMasterKey::hash_to_scalar(shared_secret.compress().as_bytes());
        
        // Derive one-time public key
        let one_time_public = hash_scalar * G + self.spend_public;
        
        StealthTransaction {
            ephemeral_public,
            one_time_public,
            ephemeral_private: Some(ephemeral_private),
        }
    }
    
    /// Serialize to bytes (66 bytes: 33 + 33 compressed points)
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(64);
        bytes.extend_from_slice(self.spend_public.compress().as_bytes());
        bytes.extend_from_slice(self.view_public.compress().as_bytes());
        bytes
    }
    
    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        if bytes.len() != 64 {
            return Err(CoreError::Serialization("Invalid stealth address length".into()));
        }
        
        let spend_compressed = CompressedRistretto::from_slice(&bytes[0..32])
            .map_err(|_| CoreError::Serialization("Invalid spend public key".into()))?;
        let view_compressed = CompressedRistretto::from_slice(&bytes[32..64])
            .map_err(|_| CoreError::Serialization("Invalid view public key".into()))?;
        
        let spend_public = spend_compressed.decompress()
            .ok_or_else(|| CoreError::Serialization("Failed to decompress spend key".into()))?;
        let view_public = view_compressed.decompress()
            .ok_or_else(|| CoreError::Serialization("Failed to decompress view key".into()))?;
        
        Ok(StealthAddress {
            spend_public,
            view_public,
        })
    }
    
    /// Encode as base58 string (for display/sharing)
    pub fn to_base58(&self) -> String {
        bs58::encode(self.to_bytes()).into_string()
    }
    
    /// Decode from base58 string
    pub fn from_base58(s: &str) -> Result<Self> {
        let bytes = bs58::decode(s)
            .into_vec()
            .map_err(|e| CoreError::Serialization(format!("Invalid base58: {}", e)))?;
        Self::from_bytes(&bytes)
    }
}

/// Stealth transaction output
#[derive(Clone, ZeroizeOnDrop)]
pub struct StealthTransaction {
    /// Ephemeral public key R (included in transaction)
    pub ephemeral_public: RistrettoPoint,
    /// One-time destination public key P (output address)
    pub one_time_public: RistrettoPoint,
    /// Ephemeral private key r (only sender knows, zeroized)
    #[zeroize(skip)]
    ephemeral_private: Option<Scalar>,
}

impl StealthTransaction {
    /// Serialize transaction data (for blockchain inclusion)
    pub fn to_transaction_data(&self) -> Vec<u8> {
        let mut data = Vec::with_capacity(64);
        data.extend_from_slice(self.ephemeral_public.compress().as_bytes());
        data.extend_from_slice(self.one_time_public.compress().as_bytes());
        data
    }
    
    /// Deserialize from transaction data
    pub fn from_transaction_data(data: &[u8]) -> Result<Self> {
        if data.len() != 64 {
            return Err(CoreError::Serialization("Invalid transaction data length".into()));
        }
        
        let ephemeral_compressed = CompressedRistretto::from_slice(&data[0..32])
            .map_err(|_| CoreError::Serialization("Invalid ephemeral key".into()))?;
        let output_compressed = CompressedRistretto::from_slice(&data[32..64])
            .map_err(|_| CoreError::Serialization("Invalid output key".into()))?;
        
        let ephemeral_public = ephemeral_compressed.decompress()
            .ok_or_else(|| CoreError::Serialization("Failed to decompress ephemeral key".into()))?;
        let one_time_public = output_compressed.decompress()
            .ok_or_else(|| CoreError::Serialization("Failed to decompress output key".into()))?;
        
        Ok(StealthTransaction {
            ephemeral_public,
            one_time_public,
            ephemeral_private: None,
        })
    }
    
    /// Get one-time address to send funds to
    pub fn destination_address(&self) -> RistrettoPoint {
        self.one_time_public
    }
}

/// Stealth address scanner for wallet
pub struct StealthScanner {
    master_key: StealthMasterKey,
    /// Cache of scanned outputs (tx_hash -> private_key)
    scanned_outputs: std::collections::HashMap<Vec<u8>, Scalar>,
}

impl StealthScanner {
    /// Create new scanner with master key
    pub fn new(master_key: StealthMasterKey) -> Self {
        StealthScanner {
            master_key,
            scanned_outputs: std::collections::HashMap::new(),
        }
    }
    
    /// Scan a batch of transactions
    pub fn scan_transactions(
        &mut self,
        transactions: &[StealthTransaction],
    ) -> Vec<(usize, Scalar)> {
        let mut owned = Vec::new();
        
        for (i, tx) in transactions.iter().enumerate() {
            if let Some(private_key) = self.master_key.scan_transaction(
                &tx.ephemeral_public,
                &tx.one_time_public,
            ) {
                // Cache the result
                let tx_id = tx.to_transaction_data();
                self.scanned_outputs.insert(tx_id, private_key);
                owned.push((i, private_key));
            }
        }
        
        owned
    }
    
    /// Get private key for previously scanned output
    pub fn get_private_key(&self, tx_data: &[u8]) -> Option<Scalar> {
        self.scanned_outputs.get(tx_data).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_generate_stealth_master_key() {
        let key = StealthMasterKey::generate();
        
        // Verify public keys are derived correctly
        assert_eq!(key.spend_public, key.spend_private * G);
        assert_eq!(key.view_public, key.view_private * G);
    }
    
    #[test]
    fn test_stealth_address_serialization() {
        let key = StealthMasterKey::generate();
        let address = key.get_stealth_address();
        
        let bytes = address.to_bytes();
        let decoded = StealthAddress::from_bytes(&bytes).unwrap();
        
        assert_eq!(address.spend_public, decoded.spend_public);
        assert_eq!(address.view_public, decoded.view_public);
    }
    
    #[test]
    fn test_stealth_address_base58() {
        let key = StealthMasterKey::generate();
        let address = key.get_stealth_address();
        
        let base58 = address.to_base58();
        let decoded = StealthAddress::from_base58(&base58).unwrap();
        
        assert_eq!(address.spend_public, decoded.spend_public);
        assert_eq!(address.view_public, decoded.view_public);
    }
    
    #[test]
    fn test_one_time_address_generation() {
        let recipient = StealthMasterKey::generate();
        let address = recipient.get_stealth_address();
        
        // Sender generates one-time address
        let tx = address.generate_one_time_address();
        
        // Verify transaction has both keys
        assert_ne!(tx.ephemeral_public, RistrettoPoint::default());
        assert_ne!(tx.one_time_public, RistrettoPoint::default());
    }
    
    #[test]
    fn test_recipient_can_scan_transaction() {
        let recipient = StealthMasterKey::generate();
        let address = recipient.get_stealth_address();
        
        // Sender generates stealth transaction
        let tx = address.generate_one_time_address();
        
        // Recipient scans and finds it belongs to them
        let private_key = recipient.scan_transaction(
            &tx.ephemeral_public,
            &tx.one_time_public,
        );
        
        assert!(private_key.is_some());
        
        // Verify derived private key corresponds to public key
        let derived_public = private_key.unwrap() * G;
        assert_eq!(derived_public, tx.one_time_public);
    }
    
    #[test]
    fn test_non_recipient_cannot_scan() {
        let recipient = StealthMasterKey::generate();
        let address = recipient.get_stealth_address();
        
        let tx = address.generate_one_time_address();
        
        // Different recipient cannot find transaction
        let other_recipient = StealthMasterKey::generate();
        let result = other_recipient.scan_transaction(
            &tx.ephemeral_public,
            &tx.one_time_public,
        );
        
        assert!(result.is_none());
    }
    
    #[test]
    fn test_transaction_serialization() {
        let recipient = StealthMasterKey::generate();
        let address = recipient.get_stealth_address();
        
        let tx = address.generate_one_time_address();
        let data = tx.to_transaction_data();
        
        let deserialized = StealthTransaction::from_transaction_data(&data).unwrap();
        
        assert_eq!(tx.ephemeral_public, deserialized.ephemeral_public);
        assert_eq!(tx.one_time_public, deserialized.one_time_public);
    }
    
    #[test]
    fn test_stealth_scanner() {
        let recipient = StealthMasterKey::generate();
        let address = recipient.get_stealth_address();
        
        // Generate multiple transactions
        let mut transactions = Vec::new();
        for _ in 0..5 {
            transactions.push(address.generate_one_time_address());
        }
        
        // Scan all transactions
        let mut scanner = StealthScanner::new(recipient);
        let owned = scanner.scan_transactions(&transactions);
        
        // All transactions should belong to recipient
        assert_eq!(owned.len(), 5);
    }
    
    #[test]
    fn test_mixed_transaction_scanning() {
        let recipient1 = StealthMasterKey::generate();
        let recipient2 = StealthMasterKey::generate();
        
        let address1 = recipient1.get_stealth_address();
        let address2 = recipient2.get_stealth_address();
        
        // Create mixed batch of transactions
        let mut transactions = Vec::new();
        transactions.push(address1.generate_one_time_address()); // belongs to recipient1
        transactions.push(address2.generate_one_time_address()); // belongs to recipient2
        transactions.push(address1.generate_one_time_address()); // belongs to recipient1
        
        // Recipient1 scans
        let mut scanner1 = StealthScanner::new(recipient1);
        let owned1 = scanner1.scan_transactions(&transactions);
        
        // Should find indices 0 and 2
        assert_eq!(owned1.len(), 2);
        assert_eq!(owned1[0].0, 0);
        assert_eq!(owned1[1].0, 2);
    }
    
    #[test]
    fn test_master_key_restoration() {
        let original = StealthMasterKey::generate();
        
        // Export keys
        let spend_bytes = original.export_spend_private();
        let view_bytes = original.export_view_private();
        
        // Restore from bytes
        let spend_scalar = Scalar::from_bytes_mod_order(spend_bytes);
        let view_scalar = Scalar::from_bytes_mod_order(view_bytes);
        
        let restored = StealthMasterKey::from_keys(spend_scalar, view_scalar);
        
        // Verify restoration
        assert_eq!(original.spend_private, restored.spend_private);
        assert_eq!(original.view_private, restored.view_private);
        assert_eq!(original.spend_public, restored.spend_public);
        assert_eq!(original.view_public, restored.view_public);
    }
}

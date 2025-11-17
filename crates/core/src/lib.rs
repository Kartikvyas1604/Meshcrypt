pub mod commitments;
pub mod crypto;
pub mod key_manager;
pub mod storage;
pub mod transaction_builder;
pub mod wallet_state;

use thiserror::Error;

/// Result type for core operations
pub type Result<T> = std::result::Result<T, CoreError>;

/// Core error types
#[derive(Debug, Error)]
pub enum CoreError {
    #[error("Invalid mnemonic: {0}")]
    InvalidMnemonic(String),
    
    #[error("Key derivation failed: {0}")]
    KeyDerivation(String),
    
    #[error("Commitment error: {0}")]
    Commitment(String),
    
    #[error("Storage error: {0}")]
    Storage(String),
    
    #[error("Cryptographic error: {0}")]
    Crypto(String),
    
    #[error("Serialization error: {0}")]
    Serialization(String),
    
    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),
}

// Re-export main types
pub use commitments::{PedersenCommitment, Commitment, RangeProof, BalanceCommitment, random_scalar};
pub use key_manager::{KeyManager, Account, CoinType, AccountDerivation};
pub use crypto::{AesGcmCipher, ChaCha20Cipher, sha256, blake2b};
pub use crypto::stealth::{StealthMasterKey, StealthAddress, StealthTransaction, StealthScanner};
pub use storage::{EncryptedDb, StoredAccount, StoredTransaction, StealthOutput};
pub use transaction_builder::{TransactionBuilder, PrivateTransaction, UTXO};
pub use wallet_state::{WalletState, TransactionRecord, ExportedKeys, WalletStatistics};

// Version info
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const AUTHORS: &str = env!("CARGO_PKG_AUTHORS");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!VERSION.is_empty());
        assert!(!AUTHORS.is_empty());
    }
}

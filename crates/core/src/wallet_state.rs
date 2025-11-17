//! Wallet State Management
//!
//! Manages encrypted wallet state including accounts, balances, and transaction history.

use crate::{
    CoreError, Result,
    key_manager::{KeyManager, Account, CoinType},
    storage::{EncryptedDb, StoredAccount, StoredTransaction},
    crypto::stealth::{StealthMasterKey, StealthAddress},
};
use serde::{Serialize, Deserialize};
use std::path::Path;
use zeroize::ZeroizeOnDrop;

/// Main wallet state manager
pub struct WalletState {
    db: EncryptedDb,
    key_manager: KeyManager,
    accounts: Vec<Account>,
    current_account_index: u32,
}

impl WalletState {
    /// Create new wallet from mnemonic
    pub fn new_wallet<P: AsRef<Path>>(
        db_path: P,
        password: &str,
        mnemonic: &str,
    ) -> Result<Self> {
        let db = EncryptedDb::new(db_path, password)?;
        let key_manager = KeyManager::new_from_mnemonic(mnemonic)?;
        
        // Store wallet metadata
        db.set_metadata("wallet_version", "1.0.0")?;
        db.set_metadata("created_at", &chrono::Utc::now().to_rfc3339())?;
        db.set_metadata("mnemonic_hash", &Self::hash_mnemonic(mnemonic))?;
        
        // Derive first account
        let account = key_manager.derive_account(0)?;
        
        // Store account in database
        let stored_account = StoredAccount {
            id: 0,
            index: account.index,
            name: account.name.clone(),
            ethereum_address: account.ethereum_address.clone(),
            solana_address: account.solana_address.clone(),
            bitcoin_address: account.bitcoin_address.clone(),
            polygon_address: account.polygon_address.clone(),
            zcash_address: account.zcash_address.clone(),
        };
        db.store_account(&stored_account)?;
        
        Ok(WalletState {
            db,
            key_manager,
            accounts: vec![account],
            current_account_index: 0,
        })
    }
    
    /// Open existing wallet
    pub fn open_wallet<P: AsRef<Path>>(
        db_path: P,
        password: &str,
        mnemonic: &str,
    ) -> Result<Self> {
        let db = EncryptedDb::new(db_path, password)?;
        
        // Verify mnemonic matches
        let stored_hash = db.get_metadata("mnemonic_hash")?
            .ok_or_else(|| CoreError::Storage("Wallet not initialized".into()))?;
        
        let provided_hash = Self::hash_mnemonic(mnemonic);
        if stored_hash != provided_hash {
            return Err(CoreError::InvalidMnemonic("Mnemonic mismatch".into()));
        }
        
        let key_manager = KeyManager::new_from_mnemonic(mnemonic)?;
        
        // Load all accounts from database
        let stored_accounts = db.get_all_accounts()?;
        let mut accounts = Vec::new();
        
        for stored in stored_accounts {
            let account = key_manager.derive_account(stored.index)?;
            accounts.push(account);
        }
        
        // Default to first account if available
        let current_account_index = if accounts.is_empty() { 0 } else { accounts[0].index };
        
        Ok(WalletState {
            db,
            key_manager,
            accounts,
            current_account_index,
        })
    }
    
    /// Generate new mnemonic for wallet creation
    pub fn generate_mnemonic() -> Result<String> {
        KeyManager::generate_mnemonic()
    }
    
    /// Hash mnemonic for verification (not reversible)
    fn hash_mnemonic(mnemonic: &str) -> String {
        use sha2::{Sha256, Digest};
        let hash = Sha256::digest(mnemonic.as_bytes());
        hex::encode(hash)
    }
    
    /// Add new account to wallet
    pub fn add_account(&mut self, name: Option<String>) -> Result<&Account> {
        let next_index = self.accounts.len() as u32;
        let mut account = self.key_manager.derive_account(next_index)?;
        
        if let Some(custom_name) = name {
            account.name = custom_name;
        }
        
        // Store in database
        let stored_account = StoredAccount {
            id: 0,
            index: account.index,
            name: account.name.clone(),
            ethereum_address: account.ethereum_address.clone(),
            solana_address: account.solana_address.clone(),
            bitcoin_address: account.bitcoin_address.clone(),
            polygon_address: account.polygon_address.clone(),
            zcash_address: account.zcash_address.clone(),
        };
        self.db.store_account(&stored_account)?;
        
        self.accounts.push(account);
        Ok(&self.accounts[self.accounts.len() - 1])
    }
    
    /// Get current account
    pub fn current_account(&self) -> Result<&Account> {
        self.accounts.iter()
            .find(|a| a.index == self.current_account_index)
            .ok_or_else(|| CoreError::InvalidParameter("No current account".into()))
    }
    
    /// Switch to different account
    pub fn switch_account(&mut self, index: u32) -> Result<()> {
        if !self.accounts.iter().any(|a| a.index == index) {
            return Err(CoreError::InvalidParameter("Account not found".into()));
        }
        
        self.current_account_index = index;
        Ok(())
    }
    
    /// Get all accounts
    pub fn get_accounts(&self) -> &[Account] {
        &self.accounts
    }
    
    /// Get account by index
    pub fn get_account(&self, index: u32) -> Option<&Account> {
        self.accounts.iter().find(|a| a.index == index)
    }
    
    /// Record transaction in database
    pub fn record_transaction(
        &self,
        account_index: u32,
        tx: TransactionRecord,
    ) -> Result<()> {
        // Find account in database
        let account = self.db.get_account(account_index)?
            .ok_or_else(|| CoreError::InvalidParameter("Account not found".into()))?;
        
        let stored_tx = StoredTransaction {
            id: 0,
            tx_hash: tx.tx_hash,
            account_id: account.id,
            chain: tx.chain,
            tx_type: tx.tx_type,
            amount: tx.amount,
            from_address: tx.from_address,
            to_address: tx.to_address,
            status: tx.status,
            timestamp: tx.timestamp,
            block_number: tx.block_number,
            gas_used: tx.gas_used,
        };
        
        self.db.store_transaction(&stored_tx)?;
        Ok(())
    }
    
    /// Get transaction history for account
    pub fn get_transaction_history(
        &self,
        account_index: u32,
        limit: u32,
    ) -> Result<Vec<StoredTransaction>> {
        let account = self.db.get_account(account_index)?
            .ok_or_else(|| CoreError::InvalidParameter("Account not found".into()))?;
        
        self.db.get_transactions(account.id, limit)
    }
    
    /// Generate stealth address for current account
    pub fn generate_stealth_address(&self) -> Result<StealthAddress> {
        let master_key = StealthMasterKey::generate();
        let address = master_key.get_stealth_address();
        
        // TODO: Store stealth keys in database for scanning
        
        Ok(address)
    }
    
    /// Export account private keys (DANGEROUS - use with caution)
    pub fn export_private_keys(&self, account_index: u32) -> Result<ExportedKeys> {
        let account = self.get_account(account_index)
            .ok_or_else(|| CoreError::InvalidParameter("Account not found".into()))?;
        
        Ok(ExportedKeys {
            ethereum: self.key_manager.export_private_key(account, CoinType::Ethereum)?,
            solana: self.key_manager.export_private_key(account, CoinType::Solana)?,
            bitcoin: self.key_manager.export_private_key(account, CoinType::Bitcoin)?,
        })
    }
    
    /// Get mnemonic phrase (for backup)
    pub fn get_mnemonic(&self) -> String {
        self.key_manager.get_mnemonic()
    }
    
    /// Sign message with account
    pub fn sign_message(
        &self,
        message: &[u8],
        account_index: u32,
        coin_type: CoinType,
    ) -> Result<Vec<u8>> {
        let account = self.get_account(account_index)
            .ok_or_else(|| CoreError::InvalidParameter("Account not found".into()))?;
        
        self.key_manager.sign_message(message, account, coin_type)
    }
    
    /// Backup wallet database
    pub fn backup<P: AsRef<Path>>(&self, backup_path: P) -> Result<()> {
        self.db.backup(backup_path)
    }
    
    /// Get wallet statistics
    pub fn get_statistics(&self) -> Result<WalletStatistics> {
        let total_accounts = self.accounts.len() as u32;
        
        // Count total transactions across all accounts
        let mut total_transactions = 0;
        for account in &self.accounts {
            if let Ok(Some(stored_account)) = self.db.get_account(account.index) {
                let txs = self.db.get_transactions(stored_account.id, 1000)?;
                total_transactions += txs.len() as u32;
            }
        }
        
        let wallet_version = self.db.get_metadata("wallet_version")?
            .unwrap_or_else(|| "unknown".to_string());
        
        let created_at = self.db.get_metadata("created_at")?
            .unwrap_or_else(|| "unknown".to_string());
        
        Ok(WalletStatistics {
            total_accounts,
            total_transactions,
            wallet_version,
            created_at,
        })
    }
}

/// Transaction record for storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionRecord {
    pub tx_hash: String,
    pub chain: String,
    pub tx_type: String,
    pub amount: String,
    pub from_address: Option<String>,
    pub to_address: Option<String>,
    pub status: String,
    pub timestamp: i64,
    pub block_number: Option<i64>,
    pub gas_used: Option<String>,
}

/// Exported private keys
#[derive(Debug, Serialize, Deserialize, ZeroizeOnDrop)]
pub struct ExportedKeys {
    pub ethereum: String,
    pub solana: String,
    pub bitcoin: String,
}

/// Wallet statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletStatistics {
    pub total_accounts: u32,
    pub total_transactions: u32,
    pub wallet_version: String,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    const TEST_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
    
    #[test]
    fn test_create_new_wallet() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        let wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        
        assert_eq!(wallet.accounts.len(), 1);
        assert_eq!(wallet.current_account_index, 0);
    }
    
    #[test]
    fn test_open_existing_wallet() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        // Create wallet
        {
            let _wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        }
        
        // Reopen wallet
        let wallet = WalletState::open_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        
        assert_eq!(wallet.accounts.len(), 1);
    }
    
    #[test]
    fn test_wrong_mnemonic_fails() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        // Create wallet
        {
            let _wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        }
        
        // Try to open with wrong mnemonic
        let wrong_mnemonic = KeyManager::generate_mnemonic().unwrap();
        let result = WalletState::open_wallet(&db_path, "password123", &wrong_mnemonic);
        
        assert!(result.is_err());
    }
    
    #[test]
    fn test_add_account() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        let mut wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        
        wallet.add_account(Some("Savings".to_string())).unwrap();
        
        assert_eq!(wallet.accounts.len(), 2);
        assert_eq!(wallet.accounts[1].name, "Savings");
    }
    
    #[test]
    fn test_switch_account() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        let mut wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        wallet.add_account(None).unwrap();
        
        assert_eq!(wallet.current_account_index, 0);
        
        wallet.switch_account(1).unwrap();
        assert_eq!(wallet.current_account_index, 1);
    }
    
    #[test]
    fn test_record_transaction() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        let wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        
        let tx = TransactionRecord {
            tx_hash: "0xabc123".to_string(),
            chain: "ethereum".to_string(),
            tx_type: "send".to_string(),
            amount: "1.5".to_string(),
            from_address: Some("0x1234".to_string()),
            to_address: Some("0x5678".to_string()),
            status: "confirmed".to_string(),
            timestamp: 1700000000,
            block_number: Some(18500000),
            gas_used: Some("21000".to_string()),
        };
        
        wallet.record_transaction(0, tx).unwrap();
        
        let history = wallet.get_transaction_history(0, 10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].tx_hash, "0xabc123");
    }
    
    #[test]
    fn test_get_statistics() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        let mut wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        wallet.add_account(None).unwrap();
        
        let stats = wallet.get_statistics().unwrap();
        
        assert_eq!(stats.total_accounts, 2);
        assert_eq!(stats.wallet_version, "1.0.0");
    }
    
    #[test]
    fn test_export_private_keys() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        let wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        
        let keys = wallet.export_private_keys(0).unwrap();
        
        assert!(!keys.ethereum.is_empty());
        assert!(!keys.solana.is_empty());
        assert!(!keys.bitcoin.is_empty());
    }
    
    #[test]
    fn test_get_mnemonic() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("wallet.db");
        
        let wallet = WalletState::new_wallet(&db_path, "password123", TEST_MNEMONIC).unwrap();
        
        let mnemonic = wallet.get_mnemonic();
        assert_eq!(mnemonic, TEST_MNEMONIC);
    }
}

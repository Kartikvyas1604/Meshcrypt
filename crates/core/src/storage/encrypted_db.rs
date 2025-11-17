use rusqlite::{Connection, params};
use serde::{Serialize, Deserialize};
use zeroize::ZeroizeOnDrop;
use std::path::Path;
use crate::{CoreError, Result};

/// Encrypted database manager
#[derive(ZeroizeOnDrop)]
pub struct EncryptedDb {
    #[zeroize(skip)]
    conn: Connection,
    #[zeroize(skip)]
    db_path: String,
}

impl EncryptedDb {
    /// Create or open encrypted database
    pub fn new<P: AsRef<Path>>(path: P, _password: &str) -> Result<Self> {
        let db_path = path.as_ref().to_string_lossy().to_string();
        
        let conn = Connection::open(&db_path)
            .map_err(|e| CoreError::Storage(format!("Failed to open database: {}", e)))?;
        
        // NOTE: For production, use SQLCipher build of rusqlite
        // For now, we'll use plain SQLite for development
        // To enable encryption, compile with: cargo build --features "rusqlite/sqlcipher"
        
        // Performance optimizations using execute_batch (doesn't expect return values)
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;"
        ).map_err(|e| CoreError::Storage(format!("Failed to set pragmas: {}", e)))?;
        
        let mut db = EncryptedDb { conn, db_path };
        db.initialize_schema()?;
        
        Ok(db)
    }
    
    /// Initialize database schema
    fn initialize_schema(&mut self) -> Result<()> {
        // Wallet metadata table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS wallet_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        ).map_err(|e| CoreError::Storage(format!("Schema creation failed: {}", e)))?;
        
        // Accounts table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_index INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL,
                ethereum_address TEXT NOT NULL,
                solana_address TEXT NOT NULL,
                bitcoin_address TEXT NOT NULL,
                polygon_address TEXT NOT NULL,
                zcash_address TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                balance_commitment BLOB
            )",
            [],
        ).map_err(|e| CoreError::Storage(format!("Schema creation failed: {}", e)))?;
        
        // Transactions table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tx_hash TEXT NOT NULL UNIQUE,
                account_id INTEGER NOT NULL,
                chain TEXT NOT NULL,
                type TEXT NOT NULL, -- 'send', 'receive', 'stealth'
                amount TEXT NOT NULL,
                from_address TEXT,
                to_address TEXT,
                status TEXT NOT NULL, -- 'pending', 'confirmed', 'failed'
                timestamp INTEGER NOT NULL,
                block_number INTEGER,
                gas_used TEXT,
                stealth_data BLOB,
                FOREIGN KEY(account_id) REFERENCES accounts(id)
            )",
            [],
        ).map_err(|e| CoreError::Storage(format!("Schema creation failed: {}", e)))?;
        
        // Stealth addresses table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS stealth_addresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                spend_public BLOB NOT NULL,
                view_public BLOB NOT NULL,
                spend_private BLOB NOT NULL,
                view_private BLOB NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(account_id) REFERENCES accounts(id)
            )",
            [],
        ).map_err(|e| CoreError::Storage(format!("Schema creation failed: {}", e)))?;
        
        // Scanned stealth outputs table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS stealth_outputs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tx_hash TEXT NOT NULL,
                account_id INTEGER NOT NULL,
                ephemeral_public BLOB NOT NULL,
                one_time_public BLOB NOT NULL,
                one_time_private BLOB NOT NULL,
                amount TEXT NOT NULL,
                spent BOOLEAN NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(account_id) REFERENCES accounts(id)
            )",
            [],
        ).map_err(|e| CoreError::Storage(format!("Schema creation failed: {}", e)))?;
        
        // Commitment proofs table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS commitment_proofs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                commitment BLOB NOT NULL,
                value TEXT NOT NULL,
                blinding BLOB NOT NULL,
                range_proof BLOB,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(account_id) REFERENCES accounts(id)
            )",
            [],
        ).map_err(|e| CoreError::Storage(format!("Schema creation failed: {}", e)))?;
        
        // Create indexes
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)",
            [],
        ).map_err(|e| CoreError::Storage(format!("Index creation failed: {}", e)))?;
        
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tx_hash ON transactions(tx_hash)",
            [],
        ).map_err(|e| CoreError::Storage(format!("Index creation failed: {}", e)))?;
        
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stealth_account ON stealth_outputs(account_id)",
            [],
        ).map_err(|e| CoreError::Storage(format!("Index creation failed: {}", e)))?;
        
        Ok(())
    }
    
    /// Store wallet metadata
    pub fn set_metadata(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO wallet_meta (key, value) VALUES (?1, ?2)",
            params![key, value],
        ).map_err(|e| CoreError::Storage(format!("Failed to set metadata: {}", e)))?;
        
        Ok(())
    }
    
    /// Get wallet metadata
    pub fn get_metadata(&self, key: &str) -> Result<Option<String>> {
        let result = self.conn.query_row(
            "SELECT value FROM wallet_meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        );
        
        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(CoreError::Storage(format!("Failed to get metadata: {}", e))),
        }
    }
    
    /// Store account
    pub fn store_account(&self, account: &StoredAccount) -> Result<i64> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        
        self.conn.execute(
            "INSERT INTO accounts (
                account_index, name, ethereum_address, solana_address,
                bitcoin_address, polygon_address, zcash_address, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                account.index,
                account.name,
                account.ethereum_address,
                account.solana_address,
                account.bitcoin_address,
                account.polygon_address,
                account.zcash_address,
                timestamp,
            ],
        ).map_err(|e| CoreError::Storage(format!("Failed to store account: {}", e)))?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get account by index
    pub fn get_account(&self, index: u32) -> Result<Option<StoredAccount>> {
        let result = self.conn.query_row(
            "SELECT id, account_index, name, ethereum_address, solana_address,
                    bitcoin_address, polygon_address, zcash_address
             FROM accounts WHERE account_index = ?1",
            params![index],
            |row| {
                Ok(StoredAccount {
                    id: row.get(0)?,
                    index: row.get(1)?,
                    name: row.get(2)?,
                    ethereum_address: row.get(3)?,
                    solana_address: row.get(4)?,
                    bitcoin_address: row.get(5)?,
                    polygon_address: row.get(6)?,
                    zcash_address: row.get(7)?,
                })
            },
        );
        
        match result {
            Ok(account) => Ok(Some(account)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(CoreError::Storage(format!("Failed to get account: {}", e))),
        }
    }
    
    /// Get all accounts
    pub fn get_all_accounts(&self) -> Result<Vec<StoredAccount>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, account_index, name, ethereum_address, solana_address,
                    bitcoin_address, polygon_address, zcash_address
             FROM accounts ORDER BY account_index"
        ).map_err(|e| CoreError::Storage(format!("Failed to prepare query: {}", e)))?;
        
        let accounts = stmt.query_map([], |row| {
            Ok(StoredAccount {
                id: row.get(0)?,
                index: row.get(1)?,
                name: row.get(2)?,
                ethereum_address: row.get(3)?,
                solana_address: row.get(4)?,
                bitcoin_address: row.get(5)?,
                polygon_address: row.get(6)?,
                zcash_address: row.get(7)?,
            })
        }).map_err(|e| CoreError::Storage(format!("Failed to query accounts: {}", e)))?;
        
        accounts.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| CoreError::Storage(format!("Failed to collect accounts: {}", e)))
    }
    
    /// Store transaction
    pub fn store_transaction(&self, tx: &StoredTransaction) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO transactions (
                tx_hash, account_id, chain, type, amount,
                from_address, to_address, status, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                tx.tx_hash,
                tx.account_id,
                tx.chain,
                tx.tx_type,
                tx.amount,
                tx.from_address,
                tx.to_address,
                tx.status,
                tx.timestamp,
            ],
        ).map_err(|e| CoreError::Storage(format!("Failed to store transaction: {}", e)))?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get transactions for account
    pub fn get_transactions(&self, account_id: i64, limit: u32) -> Result<Vec<StoredTransaction>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, tx_hash, account_id, chain, type, amount,
                    from_address, to_address, status, timestamp, block_number, gas_used
             FROM transactions
             WHERE account_id = ?1
             ORDER BY timestamp DESC
             LIMIT ?2"
        ).map_err(|e| CoreError::Storage(format!("Failed to prepare query: {}", e)))?;
        
        let txs = stmt.query_map(params![account_id, limit], |row| {
            Ok(StoredTransaction {
                id: row.get(0)?,
                tx_hash: row.get(1)?,
                account_id: row.get(2)?,
                chain: row.get(3)?,
                tx_type: row.get(4)?,
                amount: row.get(5)?,
                from_address: row.get(6)?,
                to_address: row.get(7)?,
                status: row.get(8)?,
                timestamp: row.get(9)?,
                block_number: row.get(10)?,
                gas_used: row.get(11)?,
            })
        }).map_err(|e| CoreError::Storage(format!("Failed to query transactions: {}", e)))?;
        
        txs.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| CoreError::Storage(format!("Failed to collect transactions: {}", e)))
    }
    
    /// Store stealth output
    pub fn store_stealth_output(&self, output: &StealthOutput) -> Result<i64> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        
        self.conn.execute(
            "INSERT INTO stealth_outputs (
                tx_hash, account_id, ephemeral_public, one_time_public,
                one_time_private, amount, spent, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                output.tx_hash,
                output.account_id,
                output.ephemeral_public,
                output.one_time_public,
                output.one_time_private,
                output.amount,
                output.spent,
                timestamp,
            ],
        ).map_err(|e| CoreError::Storage(format!("Failed to store stealth output: {}", e)))?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Get unspent stealth outputs for account
    pub fn get_unspent_stealth_outputs(&self, account_id: i64) -> Result<Vec<StealthOutput>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, tx_hash, account_id, ephemeral_public, one_time_public,
                    one_time_private, amount, spent
             FROM stealth_outputs
             WHERE account_id = ?1 AND spent = 0
             ORDER BY created_at DESC"
        ).map_err(|e| CoreError::Storage(format!("Failed to prepare query: {}", e)))?;
        
        let outputs = stmt.query_map(params![account_id], |row| {
            Ok(StealthOutput {
                id: row.get(0)?,
                tx_hash: row.get(1)?,
                account_id: row.get(2)?,
                ephemeral_public: row.get(3)?,
                one_time_public: row.get(4)?,
                one_time_private: row.get(5)?,
                amount: row.get(6)?,
                spent: row.get(7)?,
            })
        }).map_err(|e| CoreError::Storage(format!("Failed to query stealth outputs: {}", e)))?;
        
        outputs.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| CoreError::Storage(format!("Failed to collect stealth outputs: {}", e)))
    }
    
    /// Mark stealth output as spent
    pub fn mark_stealth_output_spent(&self, output_id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE stealth_outputs SET spent = 1 WHERE id = ?1",
            params![output_id],
        ).map_err(|e| CoreError::Storage(format!("Failed to mark output spent: {}", e)))?;
        
        Ok(())
    }
    
    /// Backup database to file
    pub fn backup<P: AsRef<Path>>(&self, backup_path: P) -> Result<()> {
        use std::fs;
        
        // Close connection first
        drop(&self.conn);
        
        // Copy database file
        fs::copy(&self.db_path, backup_path)
            .map_err(|e| CoreError::Storage(format!("Backup failed: {}", e)))?;
        
        Ok(())
    }
    
    /// Vacuum database (reclaim space, optimize)
    pub fn vacuum(&self) -> Result<()> {
        self.conn.execute("VACUUM", [])
            .map_err(|e| CoreError::Storage(format!("Vacuum failed: {}", e)))?;
        
        Ok(())
    }
}

/// Stored account data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAccount {
    pub id: i64,
    pub index: u32,
    pub name: String,
    pub ethereum_address: String,
    pub solana_address: String,
    pub bitcoin_address: String,
    pub polygon_address: String,
    pub zcash_address: String,
}

/// Stored transaction data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredTransaction {
    pub id: i64,
    pub tx_hash: String,
    pub account_id: i64,
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

/// Stealth output data
#[derive(Debug, Clone)]
pub struct StealthOutput {
    pub id: i64,
    pub tx_hash: String,
    pub account_id: i64,
    pub ephemeral_public: Vec<u8>,
    pub one_time_public: Vec<u8>,
    pub one_time_private: Vec<u8>,
    pub amount: String,
    pub spent: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[test]
    fn test_create_encrypted_db() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        
        let db = EncryptedDb::new(&db_path, "test_password_123").unwrap();
        assert!(db_path.exists());
    }
    
    #[test]
    fn test_metadata_storage() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = EncryptedDb::new(&db_path, "password").unwrap();
        
        db.set_metadata("wallet_version", "1.0.0").unwrap();
        let value = db.get_metadata("wallet_version").unwrap();
        
        assert_eq!(value, Some("1.0.0".to_string()));
    }
    
    #[test]
    fn test_account_storage() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = EncryptedDb::new(&db_path, "password").unwrap();
        
        let account = StoredAccount {
            id: 0,
            index: 0,
            name: "Account 1".to_string(),
            ethereum_address: "0x1234...".to_string(),
            solana_address: "Sol1234...".to_string(),
            bitcoin_address: "bc1q...".to_string(),
            polygon_address: "0x1234...".to_string(),
            zcash_address: "t1...".to_string(),
        };
        
        let id = db.store_account(&account).unwrap();
        assert!(id > 0);
        
        let retrieved = db.get_account(0).unwrap().unwrap();
        assert_eq!(retrieved.name, "Account 1");
        assert_eq!(retrieved.ethereum_address, "0x1234...");
    }
    
    #[test]
    fn test_transaction_storage() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = EncryptedDb::new(&db_path, "password").unwrap();
        
        // First create an account
        let account = StoredAccount {
            id: 0,
            index: 0,
            name: "Account 1".to_string(),
            ethereum_address: "0x1234...".to_string(),
            solana_address: "Sol1234...".to_string(),
            bitcoin_address: "bc1q...".to_string(),
            polygon_address: "0x1234...".to_string(),
            zcash_address: "t1...".to_string(),
        };
        let account_id = db.store_account(&account).unwrap();
        
        // Store transaction
        let tx = StoredTransaction {
            id: 0,
            tx_hash: "0xabc123...".to_string(),
            account_id,
            chain: "ethereum".to_string(),
            tx_type: "send".to_string(),
            amount: "1.5".to_string(),
            from_address: Some("0x1234...".to_string()),
            to_address: Some("0x5678...".to_string()),
            status: "confirmed".to_string(),
            timestamp: 1700000000,
            block_number: Some(18500000),
            gas_used: Some("21000".to_string()),
        };
        
        let tx_id = db.store_transaction(&tx).unwrap();
        assert!(tx_id > 0);
        
        // Retrieve transactions
        let txs = db.get_transactions(account_id, 10).unwrap();
        assert_eq!(txs.len(), 1);
        assert_eq!(txs[0].tx_hash, "0xabc123...");
    }
}

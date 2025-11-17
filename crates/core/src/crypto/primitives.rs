//! Cryptographic Primitives
//!
//! Core cryptographic operations: hashing, encryption, signing, and key exchange.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use chacha20poly1305::{
    ChaCha20Poly1305, Key as ChaChaKey,
};
use sha2::{Sha256, Sha512, Digest};
use blake2::{Blake2b512, Blake2s256};
use rand::Rng;
use crate::{CoreError, Result};

/// Hash a message using SHA-256
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Hash a message using SHA-512
pub fn sha512(data: &[u8]) -> [u8; 64] {
    let mut hasher = Sha512::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Hash a message using BLAKE2b-512
pub fn blake2b(data: &[u8]) -> [u8; 64] {
    let mut hasher = Blake2b512::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Hash a message using BLAKE2s-256
pub fn blake2s(data: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2s256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// AES-256-GCM encryption
pub struct AesGcmCipher {
    cipher: Aes256Gcm,
}

impl AesGcmCipher {
    /// Create a new cipher with a 256-bit key
    pub fn new(key: &[u8; 32]) -> Self {
        let cipher = Aes256Gcm::new(key.into());
        AesGcmCipher { cipher }
    }
    
    /// Generate a random encryption key
    pub fn generate_key() -> [u8; 32] {
        let mut key = [0u8; 32];
        rand::thread_rng().fill(&mut key);
        key
    }
    
    /// Encrypt data with AES-256-GCM
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        let ciphertext = self.cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| CoreError::Crypto(format!("Encryption failed: {}", e)))?;
        
        // Prepend nonce to ciphertext
        let mut result = nonce_bytes.to_vec();
        result.extend_from_slice(&ciphertext);
        
        Ok(result)
    }
    
    /// Decrypt data with AES-256-GCM
    pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>> {
        if ciphertext.len() < 12 {
            return Err(CoreError::Crypto("Ciphertext too short".into()));
        }
        
        let (nonce_bytes, encrypted) = ciphertext.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        
        self.cipher
            .decrypt(nonce, encrypted)
            .map_err(|e| CoreError::Crypto(format!("Decryption failed: {}", e)))
    }
}

/// ChaCha20-Poly1305 encryption (faster than AES on platforms without hardware acceleration)
pub struct ChaCha20Cipher {
    cipher: ChaCha20Poly1305,
}

impl ChaCha20Cipher {
    /// Create a new cipher with a 256-bit key
    pub fn new(key: &[u8; 32]) -> Self {
        let cipher = ChaCha20Poly1305::new(ChaChaKey::from_slice(key));
        ChaCha20Cipher { cipher }
    }
    
    /// Generate a random encryption key
    pub fn generate_key() -> [u8; 32] {
        AesGcmCipher::generate_key()
    }
    
    /// Encrypt data with ChaCha20-Poly1305
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill(&mut nonce_bytes);
        let nonce = chacha20poly1305::Nonce::from_slice(&nonce_bytes);
        
        let ciphertext = self.cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| CoreError::Crypto(format!("Encryption failed: {}", e)))?;
        
        let mut result = nonce_bytes.to_vec();
        result.extend_from_slice(&ciphertext);
        
        Ok(result)
    }
    
    /// Decrypt data with ChaCha20-Poly1305
    pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>> {
        if ciphertext.len() < 12 {
            return Err(CoreError::Crypto("Ciphertext too short".into()));
        }
        
        let (nonce_bytes, encrypted) = ciphertext.split_at(12);
        let nonce = chacha20poly1305::Nonce::from_slice(nonce_bytes);
        
        self.cipher
            .decrypt(nonce, encrypted)
            .map_err(|e| CoreError::Crypto(format!("Decryption failed: {}", e)))
    }
}

/// PBKDF2 key derivation
pub fn pbkdf2_derive_key(
    password: &[u8],
    salt: &[u8],
    iterations: u32,
) -> [u8; 32] {
    use pbkdf2::pbkdf2_hmac;
    use sha2::Sha256;
    
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password, salt, iterations, &mut key);
    key
}

/// Argon2 key derivation (memory-hard, resistant to GPU attacks)
pub fn argon2_derive_key(
    password: &[u8],
    salt: &[u8],
) -> Result<[u8; 32]> {
    use argon2::{Argon2, PasswordHasher};
    use argon2::password_hash::SaltString;
    
    let salt_string = SaltString::encode_b64(salt)
        .map_err(|e| CoreError::Crypto(format!("Invalid salt: {}", e)))?;
    
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password, &salt_string)
        .map_err(|e| CoreError::Crypto(format!("Key derivation failed: {}", e)))?;
    
    // Extract hash from the string representation
    let hash_output = hash.hash
        .ok_or_else(|| CoreError::Crypto("No hash produced".into()))?;
    
    let mut key = [0u8; 32];
    let hash_bytes = hash_output.as_bytes();
    let copy_len = hash_bytes.len().min(32);
    key[..copy_len].copy_from_slice(&hash_bytes[..copy_len]);
    Ok(key)
}

/// Stealth address derivation helpers
pub mod stealth {
    use super::*;
    use curve25519_dalek::{
        ristretto::RistrettoPoint,
        scalar::Scalar,
        constants::RISTRETTO_BASEPOINT_POINT as G,
    };
    
    /// Stealth address keypair
    pub struct StealthKeypair {
        /// Spend private key
        pub spend_private: Scalar,
        /// Spend public key
        pub spend_public: RistrettoPoint,
        /// View private key
        pub view_private: Scalar,
        /// View public key
        pub view_public: RistrettoPoint,
    }
    
    impl StealthKeypair {
        /// Generate a new stealth keypair
        pub fn generate() -> Self {
            let mut spend_bytes = [0u8; 32];
            let mut view_bytes = [0u8; 32];
            rand::thread_rng().fill(&mut spend_bytes);
            rand::thread_rng().fill(&mut view_bytes);
            
            let spend_private = Scalar::from_bytes_mod_order(spend_bytes);
            let spend_public = spend_private * G;
            
            let view_private = Scalar::from_bytes_mod_order(view_bytes);
            let view_public = view_private * G;
            
            StealthKeypair {
                spend_private,
                spend_public,
                view_private,
                view_public,
            }
        }
        
        /// Derive a one-time stealth address for a recipient
        pub fn derive_stealth_address(
            recipient_spend_public: &RistrettoPoint,
            recipient_view_public: &RistrettoPoint,
        ) -> (RistrettoPoint, RistrettoPoint, Scalar) {
            // Generate ephemeral keypair
            let mut ephemeral_bytes = [0u8; 32];
            rand::thread_rng().fill(&mut ephemeral_bytes);
            let ephemeral_private = Scalar::from_bytes_mod_order(ephemeral_bytes);
            let ephemeral_public = ephemeral_private * G;
            
            // Compute shared secret: σ = r·V
            let shared_secret = ephemeral_private * recipient_view_public;
            
            // Hash shared secret to scalar
            let hash = blake2b(shared_secret.compress().as_bytes());
            let hash_scalar = Scalar::from_bytes_mod_order_wide(&hash);
            
            // Derive stealth public key: P = H(σ)·G + S
            let stealth_public = hash_scalar * G + recipient_spend_public;
            
            (ephemeral_public, stealth_public, ephemeral_private)
        }
        
        /// Scan for owned stealth addresses
        pub fn scan_stealth_address(
            &self,
            ephemeral_public: &RistrettoPoint,
            stealth_public: &RistrettoPoint,
        ) -> Option<Scalar> {
            // Compute shared secret: σ = v·R
            let shared_secret = self.view_private * ephemeral_public;
            
            // Hash to scalar
            let hash = blake2b(shared_secret.compress().as_bytes());
            let hash_scalar = Scalar::from_bytes_mod_order_wide(&hash);
            
            // Check if this stealth address belongs to us
            let expected_public = hash_scalar * G + self.spend_public;
            
            if expected_public == *stealth_public {
                // Derive private key: p = H(σ) + s
                let stealth_private = hash_scalar + self.spend_private;
                Some(stealth_private)
            } else {
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_sha256() {
        let data = b"hello world";
        let hash = sha256(data);
        assert_eq!(hash.len(), 32);
    }
    
    #[test]
    fn test_aes_gcm_encrypt_decrypt() {
        let key = AesGcmCipher::generate_key();
        let cipher = AesGcmCipher::new(&key);
        
        let plaintext = b"secret message";
        let ciphertext = cipher.encrypt(plaintext).unwrap();
        let decrypted = cipher.decrypt(&ciphertext).unwrap();
        
        assert_eq!(plaintext, decrypted.as_slice());
    }
    
    #[test]
    fn test_chacha20_encrypt_decrypt() {
        let key = ChaCha20Cipher::generate_key();
        let cipher = ChaCha20Cipher::new(&key);
        
        let plaintext = b"secret message";
        let ciphertext = cipher.encrypt(plaintext).unwrap();
        let decrypted = cipher.decrypt(&ciphertext).unwrap();
        
        assert_eq!(plaintext, decrypted.as_slice());
    }
    
    #[test]
    fn test_pbkdf2() {
        let password = b"correct horse battery staple";
        let salt = b"random_salt_12345678";
        
        let key = pbkdf2_derive_key(password, salt, 100000);
        assert_eq!(key.len(), 32);
        
        // Same inputs should produce same key
        let key2 = pbkdf2_derive_key(password, salt, 100000);
        assert_eq!(key, key2);
    }
    
    #[test]
    fn test_stealth_address() {
        use stealth::StealthKeypair;
        
        let keypair = StealthKeypair::generate();
        
        // Sender generates stealth address
        let (ephemeral_public, stealth_public, _) = StealthKeypair::derive_stealth_address(
            &keypair.spend_public,
            &keypair.view_public,
        );
        
        // Recipient scans and finds it belongs to them
        let private_key = keypair.scan_stealth_address(&ephemeral_public, &stealth_public);
        assert!(private_key.is_some());
    }
}

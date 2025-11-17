/**
 * MeshCrypt TypeScript SDK
 * 
 * Privacy-preserving wallet SDK with ZK-SNARKs, stealth addresses,
 * and confidential transactions.
 */

import { NativeModules, Platform } from 'react-native';

const { MeshcryptFFI } = NativeModules;

if (!MeshcryptFFI) {
  throw new Error(
    'MeshcryptFFI native module not found. Make sure the native bindings are properly installed.'
  );
}

export interface WalletHandle {
  id: number;
}

export interface WalletInfo {
  address: string;
  balance: number;
  accountCount: number;
  publicKey: string;
}

export interface Transaction {
  from: string;
  to: string;
  amount: number;
  fee: number;
  nonce: number;
  signature: Uint8Array;
  privacy?: PrivacyData;
}

export interface PrivacyData {
  commitment: Uint8Array;
  rangeProof: Uint8Array;
  stealthAddress?: string;
  nullifier?: Uint8Array;
}

export interface StealthAddress {
  address: string;
  scanKey: Uint8Array;
  spendKey: Uint8Array;
}

export interface Commitment {
  commitment: Uint8Array;
  blindingFactor: Uint8Array;
}

export interface RangeProof {
  proof: Uint8Array;
  minValue: number;
  maxValue: number;
}

export interface ZkProof {
  proof: Uint8Array;
  publicInputs: Uint8Array;
  proofType: string;
}

export class MeshcryptError extends Error {
  constructor(
    message: string,
    public code:
      | 'InvalidMnemonic'
      | 'InvalidPassword'
      | 'InvalidAddress'
      | 'InsufficientFunds'
      | 'InvalidSignature'
      | 'ProofGenerationFailed'
      | 'ProofVerificationFailed'
      | 'WalletNotFound'
      | 'KeyDerivationFailed'
  ) {
    super(message);
    this.name = 'MeshcryptError';
  }
}

/**
 * Main SDK class for MeshCrypt wallet operations
 */
export class MeshcryptSDK {
  /**
   * Generate a new BIP39 mnemonic phrase
   */
  static async generateMnemonic(): Promise<string> {
    try {
      return await MeshcryptFFI.generateMnemonic();
    } catch (error) {
      throw new MeshcryptError(
        'Failed to generate mnemonic',
        'InvalidMnemonic'
      );
    }
  }

  /**
   * Create a new wallet from mnemonic
   */
  static async createWallet(
    mnemonic: string,
    password: string
  ): Promise<WalletHandle> {
    try {
      const handle = await MeshcryptFFI.createWallet(mnemonic, password);
      return handle;
    } catch (error) {
      throw new MeshcryptError(
        'Failed to create wallet',
        'InvalidMnemonic'
      );
    }
  }

  /**
   * Get wallet information
   */
  static async getWalletInfo(handle: WalletHandle): Promise<WalletInfo> {
    try {
      const info = await MeshcryptFFI.getWalletInfo(handle);
      return info;
    } catch (error) {
      throw new MeshcryptError(
        'Failed to get wallet info',
        'WalletNotFound'
      );
    }
  }

  /**
   * Create a confidential transaction
   */
  static async createTransaction(
    handle: WalletHandle,
    toAddress: string,
    amount: number
  ): Promise<Transaction> {
    try {
      const tx = await MeshcryptFFI.createTransaction(
        handle,
        toAddress,
        amount
      );
      return tx;
    } catch (error) {
      throw new MeshcryptError(
        'Failed to create transaction',
        'InsufficientFunds'
      );
    }
  }

  /**
   * Sign a transaction
   */
  static async signTransaction(
    handle: WalletHandle,
    tx: Transaction
  ): Promise<string> {
    try {
      const signature = await MeshcryptFFI.signTransaction(handle, tx);
      return signature;
    } catch (error) {
      throw new MeshcryptError(
        'Failed to sign transaction',
        'InvalidSignature'
      );
    }
  }

  /**
   * Verify a transaction
   */
  static async verifyTransaction(tx: Transaction): Promise<boolean> {
    try {
      return await MeshcryptFFI.verifyTransaction(tx);
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a stealth address for receiving private payments
   */
  static async generateStealthAddress(
    handle: WalletHandle
  ): Promise<StealthAddress> {
    try {
      const address = await MeshcryptFFI.generateStealthAddress(handle);
      return address;
    } catch (error) {
      throw new MeshcryptError(
        'Failed to generate stealth address',
        'KeyDerivationFailed'
      );
    }
  }

  /**
   * Create a Pedersen commitment
   */
  static async createCommitment(
    value: number,
    blindingFactor: Uint8Array
  ): Promise<Commitment> {
    try {
      const commitment = await MeshcryptFFI.createCommitment(
        value,
        Array.from(blindingFactor)
      );
      return commitment;
    } catch (error) {
      throw new MeshcryptError(
        'Failed to create commitment',
        'ProofGenerationFailed'
      );
    }
  }

  /**
   * Create a Bulletproof range proof
   */
  static async createRangeProof(
    commitment: Commitment,
    value: number,
    blinding: Uint8Array
  ): Promise<RangeProof> {
    try {
      const proof = await MeshcryptFFI.createRangeProof(
        commitment,
        value,
        Array.from(blinding)
      );
      return proof;
    } catch (error) {
      throw new MeshcryptError(
        'Failed to create range proof',
        'ProofGenerationFailed'
      );
    }
  }

  /**
   * Verify a range proof
   */
  static async verifyRangeProof(
    proof: RangeProof,
    commitment: Commitment
  ): Promise<boolean> {
    try {
      return await MeshcryptFFI.verifyRangeProof(proof, commitment);
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a ZK-SNARK proof
   */
  static async generateZkProof(input: {
    publicInputs: Uint8Array;
    privateInputs: Uint8Array;
    circuitType: string;
  }): Promise<ZkProof> {
    try {
      const proof = await MeshcryptFFI.generateZkProof({
        publicInputs: Array.from(input.publicInputs),
        privateInputs: Array.from(input.privateInputs),
        circuitType: input.circuitType,
      });
      return proof;
    } catch (error) {
      throw new MeshcryptError(
        'Failed to generate ZK proof',
        'ProofGenerationFailed'
      );
    }
  }

  /**
   * Verify a ZK-SNARK proof
   */
  static async verifyZkProof(
    proof: ZkProof,
    publicInputs: Uint8Array
  ): Promise<boolean> {
    try {
      return await MeshcryptFFI.verifyZkProof(
        proof,
        Array.from(publicInputs)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Export private key for an account
   */
  static async exportPrivateKey(
    handle: WalletHandle,
    accountIndex: number
  ): Promise<string> {
    try {
      return await MeshcryptFFI.exportPrivateKey(handle, accountIndex);
    } catch (error) {
      throw new MeshcryptError(
        'Failed to export private key',
        'KeyDerivationFailed'
      );
    }
  }

  /**
   * Export view key for scanning transactions
   */
  static async exportViewKey(handle: WalletHandle): Promise<string> {
    try {
      return await MeshcryptFFI.exportViewKey(handle);
    } catch (error) {
      throw new MeshcryptError(
        'Failed to export view key',
        'KeyDerivationFailed'
      );
    }
  }

  /**
   * Import wallet from private key
   */
  static async importPrivateKey(
    privateKey: string,
    password: string
  ): Promise<WalletHandle> {
    try {
      return await MeshcryptFFI.importPrivateKey(privateKey, password);
    } catch (error) {
      throw new MeshcryptError(
        'Failed to import private key',
        'InvalidPassword'
      );
    }
  }
}

/**
 * Utility functions
 */
export class MeshcryptUtils {
  /**
   * Generate random blinding factor for commitments
   */
  static generateBlindingFactor(): Uint8Array {
    const buffer = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  }

  /**
   * Convert hex string to Uint8Array
   */
  static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array to hex string
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Validate BIP39 mnemonic
   */
  static validateMnemonic(mnemonic: string): boolean {
    const words = mnemonic.trim().split(/\s+/);
    return [12, 15, 18, 21, 24].includes(words.length);
  }

  /**
   * Validate Ethereum-style address
   */
  static validateAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}

export default MeshcryptSDK;

# Zetaris TypeScript SDK

Privacy-preserving wallet SDK for React Native with ZK-SNARKs, stealth addresses, and confidential transactions.

## Installation

```bash
npm install @Zetaris/sdk
# or
yarn add @Zetaris/sdk
```

## Quick Start

```typescript
import { ZetarisSDK, ZetarisUtils } from '@Zetaris/sdk';

// Generate mnemonic
const mnemonic = await ZetarisSDK.generateMnemonic();

// Create wallet
const wallet = await ZetarisSDK.createWallet(mnemonic, 'password123');

// Get wallet info
const info = await ZetarisSDK.getWalletInfo(wallet);
console.log('Address:', info.address);
console.log('Balance:', info.balance);

// Generate stealth address for receiving
const stealthAddress = await ZetarisSDK.generateStealthAddress(wallet);
console.log('Stealth address:', stealthAddress.address);

// Create confidential transaction
const tx = await ZetarisSDK.createTransaction(
  wallet,
  '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  1000000000 // 1 ETH in wei
);

// Sign transaction
const signature = await ZetarisSDK.signTransaction(wallet, tx);
console.log('Signature:', signature);
```

## Features

### Wallet Management

```typescript
// Generate mnemonic
const mnemonic = await ZetarisSDK.generateMnemonic();

// Create wallet
const wallet = await ZetarisSDK.createWallet(mnemonic, 'password');

// Import from private key
const imported = await ZetarisSDK.importPrivateKey(privateKey, 'password');

// Export keys
const privateKey = await ZetarisSDK.exportPrivateKey(wallet, 0);
const viewKey = await ZetarisSDK.exportViewKey(wallet);
```

### Privacy Features

```typescript
// Generate stealth address
const stealthAddress = await ZetarisSDK.generateStealthAddress(wallet);

// Create Pedersen commitment
const blinding = ZetarisUtils.generateBlindingFactor();
const commitment = await ZetarisSDK.createCommitment(1000, blinding);

// Create range proof
const rangeProof = await ZetarisSDK.createRangeProof(
  commitment,
  1000,
  blinding
);

// Verify range proof
const isValid = await ZetarisSDK.verifyRangeProof(rangeProof, commitment);
```

### ZK-SNARK Proofs

```typescript
// Generate ZK proof
const proof = await ZetarisSDK.generateZkProof({
  publicInputs: new Uint8Array([1, 2, 3]),
  privateInputs: new Uint8Array([4, 5, 6]),
  circuitType: 'confidential_transfer',
});

// Verify ZK proof
const isValid = await ZetarisSDK.verifyZkProof(
  proof,
  new Uint8Array([1, 2, 3])
);
```

### Transaction Operations

```typescript
// Create transaction
const tx = await ZetarisSDK.createTransaction(
  wallet,
  recipientAddress,
  amount
);

// Sign transaction
const signature = await ZetarisSDK.signTransaction(wallet, tx);

// Verify transaction
const isValid = await ZetarisSDK.verifyTransaction(tx);
```

## API Reference

### ZetarisSDK

#### Static Methods

- `generateMnemonic(): Promise<string>` - Generate BIP39 mnemonic
- `createWallet(mnemonic: string, password: string): Promise<WalletHandle>` - Create wallet from mnemonic
- `getWalletInfo(handle: WalletHandle): Promise<WalletInfo>` - Get wallet information
- `createTransaction(handle: WalletHandle, to: string, amount: number): Promise<Transaction>` - Create confidential transaction
- `signTransaction(handle: WalletHandle, tx: Transaction): Promise<string>` - Sign transaction
- `verifyTransaction(tx: Transaction): Promise<boolean>` - Verify transaction
- `generateStealthAddress(handle: WalletHandle): Promise<StealthAddress>` - Generate stealth address
- `createCommitment(value: number, blinding: Uint8Array): Promise<Commitment>` - Create Pedersen commitment
- `createRangeProof(commitment: Commitment, value: number, blinding: Uint8Array): Promise<RangeProof>` - Create range proof
- `verifyRangeProof(proof: RangeProof, commitment: Commitment): Promise<boolean>` - Verify range proof
- `generateZkProof(input: ProofInput): Promise<ZkProof>` - Generate ZK-SNARK proof
- `verifyZkProof(proof: ZkProof, publicInputs: Uint8Array): Promise<boolean>` - Verify ZK-SNARK proof
- `exportPrivateKey(handle: WalletHandle, accountIndex: number): Promise<string>` - Export private key
- `exportViewKey(handle: WalletHandle): Promise<string>` - Export view key
- `importPrivateKey(privateKey: string, password: string): Promise<WalletHandle>` - Import from private key

### ZetarisUtils

#### Static Methods

- `generateBlindingFactor(): Uint8Array` - Generate random blinding factor
- `hexToBytes(hex: string): Uint8Array` - Convert hex to bytes
- `bytesToHex(bytes: Uint8Array): string` - Convert bytes to hex
- `validateMnemonic(mnemonic: string): boolean` - Validate BIP39 mnemonic
- `validateAddress(address: string): boolean` - Validate Ethereum address

## Types

```typescript
interface WalletHandle {
  id: number;
}

interface WalletInfo {
  address: string;
  balance: number;
  accountCount: number;
  publicKey: string;
}

interface Transaction {
  from: string;
  to: string;
  amount: number;
  fee: number;
  nonce: number;
  signature: Uint8Array;
  privacy?: PrivacyData;
}

interface PrivacyData {
  commitment: Uint8Array;
  rangeProof: Uint8Array;
  stealthAddress?: string;
  nullifier?: Uint8Array;
}

interface StealthAddress {
  address: string;
  scanKey: Uint8Array;
  spendKey: Uint8Array;
}

interface Commitment {
  commitment: Uint8Array;
  blindingFactor: Uint8Array;
}

interface RangeProof {
  proof: Uint8Array;
  minValue: number;
  maxValue: number;
}

interface ZkProof {
  proof: Uint8Array;
  publicInputs: Uint8Array;
  proofType: string;
}
```

## Error Handling

```typescript
import { ZetarisError } from '@Zetaris/sdk';

try {
  const wallet = await ZetarisSDK.createWallet(mnemonic, password);
} catch (error) {
  if (error instanceof ZetarisError) {
    console.error('Error code:', error.code);
    console.error('Message:', error.message);
  }
}
```

## Building from Source

```bash
# Clone repository
git clone https://github.com/Zetaris/Zetaris.git
cd Zetaris/sdk/ts-sdk

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

## Native Module Setup

### iOS

```bash
cd ios && pod install
```

### Android

Add to `android/app/build.gradle`:

```gradle
dependencies {
    implementation project(':Zetaris-ffi')
}
```

## License

MIT License - see LICENSE file

## Contributing

Contributions welcome! Please see CONTRIBUTING.md

## Security

Report security issues to security@Zetaris.io

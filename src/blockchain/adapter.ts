import { Balance, TransactionRequest, Address } from '../types';

export interface BlockchainAdapter {
  getChainName(): string;
  getBalance(address: string): Promise<Balance>;
  sendTransaction(request: TransactionRequest): Promise<string>;
  estimateFee(request: TransactionRequest): Promise<string>;
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;
  generateAddress(publicKey: Uint8Array, index: number): Promise<Address>;
  subscribeToEvents(callback: (event: BlockchainEvent) => void): void;
  sync(): Promise<void>;
}

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  blockNumber?: number;
  timestamp?: number;
}

export interface BlockchainEvent {
  type: 'transaction' | 'block' | 'reorg';
  data: any;
  chain: string;
  timestamp: number;
}

export abstract class BaseAdapter implements BlockchainAdapter {
  protected network: 'mainnet' | 'testnet' | 'polygon' | 'arbitrum' | 'optimism' | string;
  protected nodeUrl: string;

  constructor(network: string, nodeUrl: string) {
    this.network = network;
    this.nodeUrl = nodeUrl;
  }

  abstract getChainName(): string;
  abstract getBalance(address: string): Promise<Balance>;
  abstract sendTransaction(request: TransactionRequest): Promise<string>;
  abstract estimateFee(request: TransactionRequest): Promise<string>;
  abstract getTransactionStatus(txHash: string): Promise<TransactionStatus>;
  abstract generateAddress(publicKey: Uint8Array, index: number): Promise<Address>;
  abstract subscribeToEvents(callback: (event: BlockchainEvent) => void): void;
  abstract sync(): Promise<void>;

  protected async retryRequest<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          await this.delay(Math.pow(2, i) * 1000);
        }
      }
    }
    
    throw lastError || new Error('Request failed after retries');
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

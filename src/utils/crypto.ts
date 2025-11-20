// Use react-native-quick-crypto polyfill
const crypto = require('crypto');

export class CryptoUtils {
  static hash(data: Uint8Array | Buffer, algorithm: string = 'sha256'): Buffer {
    return crypto.createHash(algorithm).update(data).digest();
  }

  static randomBytes(length: number): Uint8Array {
    return new Uint8Array(crypto.randomBytes(length));
  }

  static async pbkdf2(password: string, salt: Uint8Array, iterations: number, keyLength: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, Buffer.from(salt), iterations, keyLength, 'sha512', (err: Error | null, derivedKey: Buffer) => {
        if (err) reject(err);
        else resolve(new Uint8Array(derivedKey));
      });
    });
  }

  static encrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
    const encrypted = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return new Uint8Array(Buffer.concat([encrypted, authTag]));
  }

  static decrypt(encryptedData: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    const data = Buffer.from(encryptedData);
    const authTag = data.slice(-16);
    const encrypted = data.slice(0, -16);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return new Uint8Array(decrypted);
  }

  static secureCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }

  static zeroize(buffer: Uint8Array): void {
    buffer.fill(0);
  }

  static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  static base58Encode(bytes: Uint8Array): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base = BigInt(58);
    let num = BigInt(0);
    
    for (const byte of bytes) {
      num = num * BigInt(256) + BigInt(byte);
    }
    
    let encoded = '';
    while (num > 0) {
      const remainder = Number(num % base);
      encoded = ALPHABET[remainder] + encoded;
      num = num / base;
    }
    
    for (const byte of bytes) {
      if (byte === 0) encoded = '1' + encoded;
      else break;
    }
    
    return encoded;
  }

  static base58Decode(str: string): Uint8Array {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base = BigInt(58);
    let num = BigInt(0);
    
    for (const char of str) {
      const index = ALPHABET.indexOf(char);
      if (index === -1) throw new Error('Invalid base58 character');
      num = num * base + BigInt(index);
    }
    
    const bytes: number[] = [];
    while (num > 0) {
      bytes.unshift(Number(num % BigInt(256)));
      num = num / BigInt(256);
    }
    
    for (const char of str) {
      if (char === '1') bytes.unshift(0);
      else break;
    }
    
    return new Uint8Array(bytes);
  }
}

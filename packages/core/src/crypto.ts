// Application-layer encryption for descriptors and donor PII, plus a blind index for email lookup.
// Keys are 32 random bytes, base64. Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

function keyFromBase64(b64: string, label: string) {
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error(`${label} must be 32 bytes, base64-encoded`);
  return k;
}

export interface Crypto {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  /** Deterministic, keyed, over the normalised email. Stored beside the ciphertext so lookups never touch plaintext. */
  emailIndex(email: string): string;
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createCrypto(keys: { encryptionKey: string; indexKey: string }): Crypto {
  const enc = keyFromBase64(keys.encryptionKey, 'ENCRYPTION_KEY');
  const idx = keyFromBase64(keys.indexKey, 'INDEX_KEY');
  if (timingSafeEqual(enc, idx)) throw new Error('ENCRYPTION_KEY and INDEX_KEY must differ');

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', enc, iv);
      const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join('.');
    },
    decrypt(ciphertext) {
      const [v, ivB64, ctB64, tagB64] = ciphertext.split('.');
      if (v !== VERSION || !ivB64 || !ctB64 || !tagB64) throw new Error('unrecognised ciphertext format');
      const decipher = createDecipheriv('aes-256-gcm', enc, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
    },
    emailIndex(email) {
      return createHmac('sha256', idx).update(normaliseEmail(email)).digest('base64url');
    },
  };
}

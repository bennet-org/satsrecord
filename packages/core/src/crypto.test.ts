import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createCrypto } from './crypto';

const keys = { encryptionKey: randomBytes(32).toString('base64'), indexKey: randomBytes(32).toString('base64') };

describe('crypto', () => {
  it('round-trips and never repeats ciphertext', () => {
    const c = createCrypto(keys);
    const a = c.encrypt('wpkh(xpub.../0/*)');
    const b = c.encrypt('wpkh(xpub.../0/*)');
    expect(a).not.toBe(b);
    expect(c.decrypt(a)).toBe('wpkh(xpub.../0/*)');
    expect(a.startsWith('v1.')).toBe(true);
  });
  it('rejects tampering', () => {
    const c = createCrypto(keys);
    const ct = c.encrypt('secret');
    const parts = ct.split('.');
    parts[2] = Buffer.from('xxxxxx').toString('base64');
    expect(() => c.decrypt(parts.join('.'))).toThrow();
  });
  it('rejects the wrong key', () => {
    const ct = createCrypto(keys).encrypt('secret');
    const other = createCrypto({ ...keys, encryptionKey: randomBytes(32).toString('base64') });
    expect(() => other.decrypt(ct)).toThrow();
  });
  it('email index is keyed and normalised', () => {
    const c = createCrypto(keys);
    expect(c.emailIndex(' Donor@Example.org ')).toBe(c.emailIndex('donor@example.org'));
    expect(c.emailIndex('a@example.org')).not.toBe(c.emailIndex('b@example.org'));
    const other = createCrypto({ ...keys, indexKey: randomBytes(32).toString('base64') });
    expect(other.emailIndex('a@example.org')).not.toBe(c.emailIndex('a@example.org'));
  });
  it('refuses bad keys', () => {
    expect(() => createCrypto({ encryptionKey: 'short', indexKey: keys.indexKey })).toThrow(/32 bytes/);
    expect(() => createCrypto({ encryptionKey: keys.encryptionKey, indexKey: keys.encryptionKey })).toThrow(/differ/);
  });
});

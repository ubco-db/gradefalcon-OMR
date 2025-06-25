const { encrypt, decrypt } = require('../../utils/crypto');

describe('Crypto Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and environment to ensure test isolation
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_SALT;
  });

  afterAll(() => {
    // Restore original environment after all tests
    process.env = originalEnv;
  });

  describe('encrypt()', () => {
    it('should encrypt a string into a three-part hex string', async () => {
      const encrypted = await encrypt('my secret');
      expect(typeof encrypted).toBe('string');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      parts.forEach(part => {
        expect(part).toMatch(/^[0-9a-f]+$/i);
      });
    });

    it('should throw an error if input is null', async () => {
      await expect(encrypt(null)).rejects.toThrow('Text to be encrypted cannot be null or undefined.');
    });

    it('should throw an error if input is undefined', async () => {
      await expect(encrypt(undefined)).rejects.toThrow('Text to be encrypted cannot be null or undefined.');
    });
  });

  describe('decrypt()', () => {
    it('should throw an error for null input', async () => {
      await expect(decrypt(null)).rejects.toThrow('Encrypted text must be a non-null string.');
    });

    it('should throw an error for malformed input (not enough parts)', async () => {
      await expect(decrypt('abc:def')).rejects.toThrow('Invalid encrypted text format: Must contain three parts separated by colons.');
    });
    
    it('should throw an error for malformed input (empty parts)', async () => {
      await expect(decrypt('abc::ghi')).rejects.toThrow('Invalid encrypted text format: Parts cannot be empty.');
    });

    it('should throw an error if the auth tag is incorrect (tampered data)', async () => {
      const encrypted = await encrypt('some data');
      const parts = encrypted.split(':');
      const tamperedTag = '0'.repeat(32);
      const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;
      await expect(decrypt(tampered)).rejects.toThrow(/Decryption failed/);
    });

    it('should throw an error if the key is incorrect', async () => {
      const encrypted = await encrypt('some data');
      process.env.ENCRYPTION_KEY = 'a-different-key';
      // Re-import module to use new environment variables
      const { decrypt: decryptWithNewKey } = require('../../utils/crypto');
      await expect(decryptWithNewKey(encrypted)).rejects.toThrow(/Decryption failed/);
    });
  });

  describe('Integration: encrypt() and decrypt()', () => {
    it('should correctly decrypt an encrypted string', async () => {
      const originalText = 'this is a super secret message';
      const encrypted = await encrypt(originalText);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should work with unicode characters', async () => {
      const originalText = '你好世界 🌍';
      const encrypted = await encrypt(originalText);
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should produce different ciphertexts for the same plaintext', async () => {
      const encrypted1 = await encrypt('my secret');
      const encrypted2 = await encrypt('my secret');
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should correctly handle numeric and boolean inputs by converting them to strings', async () => {
      const numEncrypted = await encrypt(12345);
      expect(await decrypt(numEncrypted)).toBe('12345');

      const boolEncrypted = await encrypt(true);
      expect(await decrypt(boolEncrypted)).toBe('true');
    });

    it('should work with custom environment variables for key and salt', async () => {
      process.env.ENCRYPTION_KEY = 'my-custom-secret-key-string';
      process.env.ENCRYPTION_SALT = 'my-custom-salt-string';
      const { encrypt: encryptWithEnv, decrypt: decryptWithEnv } = require('../../utils/crypto');
      
      const originalText = 'data encrypted with custom env';
      const encrypted = await encryptWithEnv(originalText);
      const decrypted = await decryptWithEnv(encrypted);
      expect(decrypted).toBe(originalText);
    });
  });
});
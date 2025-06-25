const crypto = require('crypto').promises;
const { createCipheriv, createDecipheriv } = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

const DEFAULT_KEY = 'dev-default-crypto-secret-key';
const DEFAULT_SALT = 'dev-default-crypto-salt';

const getKey = async () => {
  const keyString = process.env.ENCRYPTION_KEY || DEFAULT_KEY;
  const salt = process.env.ENCRYPTION_SALT || DEFAULT_SALT;
  return await crypto.scrypt(keyString, salt, KEY_LENGTH);
};

const encrypt = async (text) => {
  const key = await getKey();
  const iv = await crypto.randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decrypt = async (encryptedText) => {
  const key = await getKey();
  const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid encrypted text format.');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };
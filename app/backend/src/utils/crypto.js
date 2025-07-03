const crypto = require('crypto');
const util = require('util');

// Promisify crypto functions for async/await usage
const scrypt = util.promisify(crypto.scrypt);
const randomBytes = util.promisify(crypto.randomBytes);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const DEFAULT_KEY = 'dev-default-crypto-secret-key';
const DEFAULT_SALT = 'dev-default-crypto-salt';

const getKey = async () => {
  const keyString = process.env.ENCRYPTION_KEY || DEFAULT_KEY;
  const salt = process.env.ENCRYPTION_SALT || DEFAULT_SALT;
  return await scrypt(keyString, salt, KEY_LENGTH);
};

/**
 * Encrypts the given plaintext using AES-256-GCM.
 * Generates a random IV for each encryption and returns the result as a string formatted as "iv:authTag:ciphertext", all in hex.
 *
 * @async
 * @param {string|number|object} text - The plaintext to encrypt. Will be stringified.
 * @returns {Promise<string>} The encrypted string in "iv:authTag:ciphertext" format, hex-encoded.
 * @throws {Error} If the input text is null or undefined.
 */
const encrypt = async (text) => {
  if (text === null || text === undefined) {
    throw new Error('Text to be encrypted cannot be null or undefined.');
  }
  
  const textString = String(text);
  
  const key = await getKey();
  const iv = await randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encryptedBuffer = Buffer.concat([cipher.update(textString, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encryptedBuffer.toString('hex')}`;
};


/**
 * Decrypts the given ciphertext string produced by the encrypt function using AES-256-GCM.
 * Validates the input format and authentication tag before decryption.
 *
 * @async
 * @param {string} encryptedText - The encrypted string in "iv:authTag:ciphertext" format, hex-encoded.
 * @returns {Promise<string>} The decrypted plaintext as a UTF-8 string.
 * @throws {Error} If the input is invalid, the format is incorrect, or decryption fails.
 */
const decrypt = async (encryptedText) => {
  if (encryptedText === null || encryptedText === undefined || typeof encryptedText !== 'string') {
    throw new Error('Encrypted text must be a non-null string.');
  }
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format: Must contain three parts separated by colons.');
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;

  if (!ivHex || !authTagHex) {
    throw new Error('Invalid encrypted text format: Parts cannot be empty.');
  }

  const key = await getKey();
  
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedBuffer = Buffer.from(encryptedHex, 'hex');

    if (iv.length !== IV_LENGTH) {
        throw new Error('Invalid IV length.');
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('Invalid authTag length.');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decryptedBuffer = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
    
    return decryptedBuffer.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed. ${error.message}`);
  }
};

module.exports = { encrypt, decrypt };
const crypto = require('crypto');

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(obj, secret) {
  if (!secret) throw new Error('ENCRYPTION_SECRET is not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64'),
  };
}

function decrypt(blob, secret) {
  if (!blob) return null;
  if (!secret) throw new Error('ENCRYPTION_SECRET is not configured');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch (err) {
    return null;
  }
}

module.exports = { encrypt, decrypt };
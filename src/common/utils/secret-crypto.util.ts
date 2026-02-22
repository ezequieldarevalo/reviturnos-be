import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const SECRET_PREFIX = 'enc:v1:';

function buildKey(secretKey: string): Buffer {
  if (!secretKey) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is required');
  }
  return createHash('sha256').update(secretKey).digest();
}

export function isEncryptedSecret(value?: string | null): boolean {
  return !!value && value.startsWith(SECRET_PREFIX);
}

export function encryptSecret(plainText: string, secretKey: string): string {
  if (!plainText) return plainText;

  const key = buildKey(secretKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(value: string, secretKey: string): string {
  if (!value) return value;
  if (!isEncryptedSecret(value)) return value;

  const payload = value.slice(SECRET_PREFIX.length);
  const [ivHex, authTagHex, encryptedHex] = payload.split(':');

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted secret format');
  }

  const key = buildKey(secretKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskSecret(value?: string | null): string | null {
  if (!value) return null;
  const visible = value.length <= 8 ? 2 : 4;
  return `${'*'.repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
}

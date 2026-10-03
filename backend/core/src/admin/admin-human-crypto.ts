import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SCRYPT_PREFIX = 'scrypt-v1';
const SCRYPT_KEY_LENGTH = 64;

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error != null) {
          reject(error);
          return;
        }
        resolve(Buffer.from(derivedKey));
      },
    );
  });
}

export function normalizeAdminEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    email.length < 5 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('E-mail administrativo inválido.');
  }
  return email;
}

export async function hashAdminPassword(
  password: string,
): Promise<string> {
  if (password.length < 12 || password.length > 256) {
    throw new Error('Senha administrativa inválida.');
  }
  const salt = randomBytes(16);
  const derived = await scryptKey(password, salt);
  return [
    SCRYPT_PREFIX,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyAdminPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [prefix, saltEncoded, hashEncoded] = encoded.split('$');
  if (
    prefix !== SCRYPT_PREFIX ||
    !saltEncoded ||
    !hashEncoded ||
    password.length > 256
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltEncoded, 'base64url');
    const expected = Buffer.from(hashEncoded, 'base64url');
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) {
      return false;
    }
    const actual = await scryptKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function resolveAdminMfaEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const raw = env.ADMIN_MFA_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'ADMIN_MFA_ENCRYPTION_KEY é obrigatório em produção.',
      );
    }
    return createHash('sha256')
      .update('ramo-nessa-admin-mfa-development-only', 'utf8')
      .digest();
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('ADMIN_MFA_ENCRYPTION_KEY é inválido.');
  }
  if (key.length !== 32) {
    throw new Error(
      'ADMIN_MFA_ENCRYPTION_KEY deve decodificar exatamente 32 bytes.',
    );
  }
  return key;
}

export function encryptAdminTotpSecret(
  secret: Buffer,
  key: Buffer,
): string {
  if (key.length !== 32 || secret.length < 16) {
    throw new Error('Material criptográfico administrativo inválido.');
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptAdminTotpSecret(
  encoded: string,
  key: Buffer,
): Buffer {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] =
    encoded.split('.');
  if (
    version !== 'v1' ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded ||
    key.length !== 32
  ) {
    throw new Error('Segredo TOTP administrativo inválido.');
  }

  const iv = Buffer.from(ivEncoded, 'base64url');
  const tag = Buffer.from(tagEncoded, 'base64url');
  const ciphertext = Buffer.from(ciphertextEncoded, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

export function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]!;
  }
  return output;
}

export function decodeBase32(value: string): Buffer {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/=+$/g, '');
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Base32 inválido.');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret)
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function totpCodeAt(
  secretBase32: string,
  now: Date,
): string {
  const counter = Math.floor(now.getTime() / 30_000);
  return totpCode(decodeBase32(secretBase32), counter);
}

export function verifyAdminTotp(input: {
  secret: Buffer;
  code: string;
  now: Date;
}): number | null {
  if (!/^\d{6}$/.test(input.code)) return null;
  const current = Math.floor(input.now.getTime() / 30_000);

  for (const offset of [-1, 0, 1]) {
    const counter = current + offset;
    if (counter < 0) continue;
    const candidate = totpCode(input.secret, counter);
    if (
      timingSafeEqual(
        Buffer.from(candidate, 'utf8'),
        Buffer.from(input.code, 'utf8'),
      )
    ) {
      return counter;
    }
  }
  return null;
}

export function randomAdminTotpSecret(): Buffer {
  return randomBytes(20);
}

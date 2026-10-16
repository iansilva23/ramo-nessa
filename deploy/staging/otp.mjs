import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export async function stagingOtpConfiguration(envFile) {
  const values = new Map();
  for (const line of (await readFile(envFile, 'utf8')).split(/\r?\n/)) {
    const match = line.trim().match(/^(OTP_PROVIDER|ENTRAR_API_SECRET_HOST_FILE)\s*=(.*)$/);
    if (!match) continue;
    if (values.has(match[1])) throw new Error('Configuração OTP duplicada: ' + match[1]);
    values.set(match[1], match[2].trim());
  }
  const provider = values.get('OTP_PROVIDER') ?? 'dev';
  if (provider === 'dev') return { provider };
  if (provider !== 'entrar-whatsapp') throw new Error('OTP_PROVIDER deve ser dev ou entrar-whatsapp na homologação.');
  const hostFile = values.get('ENTRAR_API_SECRET_HOST_FILE') ?? '';
  if (!isAbsolute(hostFile) || /[\x00-\x20$]/.test(hostFile)) {
    throw new Error('ENTRAR_API_SECRET_HOST_FILE deve ser um caminho absoluto privado sem espaços ou interpolação.');
  }
  let secret;
  try {
    const info = await lstat(hostFile);
    if (!info.isFile() || (info.mode & 0o077) !== 0 || (info.mode & 0o400) === 0 || info.size > 4096) throw new Error();
    secret = (await readFile(hostFile, 'utf8')).trim();
  } catch {
    throw new Error('API Secret deve estar em arquivo regular legível e privado (0600).');
  }
  if (!secret || /[\s\x00-\x1f]/.test(secret)) throw new Error('API Secret ausente ou inválido.');
  return { provider, secret };
}

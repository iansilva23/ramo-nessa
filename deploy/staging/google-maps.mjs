import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export async function stagingGoogleMapsConfiguration(envFile) {
  const values = new Map();
  for (const line of (await readFile(envFile, 'utf8')).split(/\r?\n/)) {
    const match = line.trim().match(/^(GOOGLE_MAPS_PROVIDER|GOOGLE_MAPS_SERVER_API_KEY_HOST_FILE)\s*=(.*)$/);
    if (!match) continue;
    if (values.has(match[1])) throw new Error('Configuração Google Maps duplicada: ' + match[1]);
    values.set(match[1], match[2].trim());
  }
  const provider = values.get('GOOGLE_MAPS_PROVIDER') ?? 'mock';
  if (provider === 'mock') return { provider };
  if (provider !== 'google') throw new Error('GOOGLE_MAPS_PROVIDER deve ser mock ou google.');
  const hostFile = values.get('GOOGLE_MAPS_SERVER_API_KEY_HOST_FILE') ?? '';
  if (!isAbsolute(hostFile) || /[\x00-\x20$]/.test(hostFile)) {
    throw new Error('GOOGLE_MAPS_SERVER_API_KEY_HOST_FILE deve ser um caminho absoluto privado, sem espaços ou interpolação.');
  }
  let apiKey;
  try {
    const info = await lstat(hostFile);
    if (!info.isFile() || (info.mode & 0o077) !== 0 || (info.mode & 0o400) === 0) throw new Error();
    apiKey = (await readFile(hostFile, 'utf8')).trim();
  } catch {
    throw new Error('Chave Google Maps deve ser um arquivo regular legível e privado (0600).');
  }
  if (!/^AIza[A-Za-z0-9_-]{35}$/.test(apiKey)) {
    throw new Error('Arquivo Google Maps não contém uma chave de API válida.');
  }
  return { provider, apiKey };
}

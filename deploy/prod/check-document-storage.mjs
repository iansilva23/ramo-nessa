import {
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';

const rawRoot = process.env.DOCUMENT_STORAGE_LOCAL_DIR?.trim() ?? '';
if (!rawRoot || !isAbsolute(rawRoot)) {
  throw new Error(
    'DOCUMENT_STORAGE_LOCAL_DIR absoluto é obrigatório para o storage check.',
  );
}

const root = resolve(rawRoot);
await mkdir(root, { recursive: true, mode: 0o700 });

const rootInfo = await stat(root);
if (!rootInfo.isDirectory()) {
  throw new Error('Diretório privado de documentos não é um diretório.');
}
if ((rootInfo.mode & 0o077) !== 0) {
  throw new Error(
    'Diretório privado de documentos deve usar permissão 0700 ou mais restritiva.',
  );
}

const uid = process.getuid?.();
const gid = process.getgid?.();
if (uid != null && rootInfo.uid !== uid) {
  throw new Error(
    'Diretório privado de documentos não pertence ao usuário do Core.',
  );
}
if (gid != null && rootInfo.gid !== gid) {
  throw new Error(
    'Diretório privado de documentos não pertence ao grupo do Core.',
  );
}

const probeName =
  '.ramo-storage-probe-' +
  process.pid +
  '-' +
  Date.now() +
  '-' +
  randomBytes(6).toString('hex');
const probePath = resolve(root, probeName);
const expected = Buffer.from(
  'ramo-nessa-private-storage-probe\n',
  'utf8',
);

try {
  await writeFile(probePath, expected, {
    flag: 'wx',
    mode: 0o600,
  });

  const probeInfo = await stat(probePath);
  if (!probeInfo.isFile() || (probeInfo.mode & 0o077) !== 0) {
    throw new Error(
      'Arquivo de prova do storage não ficou privado (0600).',
    );
  }

  const actual = await readFile(probePath);
  if (!actual.equals(expected)) {
    throw new Error(
      'Storage privado falhou na verificação de escrita/leitura.',
    );
  }
} finally {
  await unlink(probePath).catch(() => {});
}

console.log(
  'Storage privado de documentos: permissões, escrita e leitura válidas.',
);

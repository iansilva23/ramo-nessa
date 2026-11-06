import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureTestEnvironment } from './env.mjs';

const force = process.argv.includes('--force');
const outputArg = process.argv
  .slice(2)
  .find((value) => value.startsWith('--output='));
const output = outputArg?.slice('--output='.length) || '.env';
const portArg = process.argv
  .slice(2)
  .find((value) => value.startsWith('--port='));
const port = Number(portArg?.slice('--port='.length) || '8080');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('--port deve estar entre 1 e 65535.');
}
if (!/^\.env(?:[.-][A-Za-z0-9_-]+)?$/.test(output)) {
  throw new Error('--output deve ser um arquivo .env dentro de deploy/test.');
}

const here = fileURLToPath(new URL('.', import.meta.url));
const filePath = resolve(here, output);
const result = await ensureTestEnvironment(filePath, { force, port });

console.log(
  result.created
    ? `Ambiente de teste criado em ${output}.`
    : `${output} já existe; nenhum segredo foi alterado.`,
);

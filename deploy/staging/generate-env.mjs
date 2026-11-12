import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureStagingEnvironment } from './env.mjs';

const force = process.argv.includes('--force');
const outputArg = process.argv.slice(2).find((value) => value.startsWith('--output='));
const output = outputArg?.slice('--output='.length) || '.env';
if (!/^\.env(?:[.-][A-Za-z0-9_-]+)?$/.test(output)) {
  throw new Error('--output deve ser um arquivo .env dentro de deploy/staging.');
}
const here = fileURLToPath(new URL('.', import.meta.url));
const result = await ensureStagingEnvironment(resolve(here, output), { force });
console.log(result.created
  ? 'Ambiente de homologação criado em ' + output + '. Configure APP_DOMAIN e ACME_EMAIL.'
  : output + ' já existe; nenhum segredo foi alterado.');

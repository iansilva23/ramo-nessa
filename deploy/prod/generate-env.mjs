import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureProductionEnvironment } from './env.mjs';

const force = process.argv.includes('--force');
const outputArg = process.argv
  .slice(2)
  .find((value) => value.startsWith('--output='));
const output = outputArg?.slice('--output='.length) || '.env';

if (!/^\.env(?:[.-][A-Za-z0-9_-]+)?$/.test(output)) {
  throw new Error(
    '--output deve ser um arquivo .env dentro de deploy/prod.',
  );
}

const here = fileURLToPath(new URL('.', import.meta.url));
const filePath = resolve(here, output);
const result = await ensureProductionEnvironment(filePath, { force });

console.log(
  result.created
    ? 'Ambiente de produção criado em ' +
        output +
        '. Edite apenas os campos CHANGE_ME e valide antes de qualquer deploy.'
    : output + ' já existe; nenhum segredo foi alterado.',
);

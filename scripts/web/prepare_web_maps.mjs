import { readFile, writeFile } from 'node:fs/promises';
import { prepareMapsWebIndex } from './maps_web_config.mjs';
const role = process.argv.find(arg => arg.startsWith('--role='))?.slice(7);
if (!['passenger', 'driver'].includes(role)) throw new Error('Informe --role=passenger|driver');
const review = process.argv.includes('--ci-review');
if (review && process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Placeholder Maps permitido somente em revisão no GitHub Actions.');
}
const file = new URL('../../apps/' + role + '/web/index.html', import.meta.url);
const index = await readFile(file, 'utf8');
const prepared = prepareMapsWebIndex(index, process.env.RAMO_GOOGLE_MAPS_WEB_API_KEY,
  { allowReviewPlaceholder: review });
await writeFile(file, prepared);
console.log('Maps ' + role + ': entrada preparada; restrições e funcionamento exigem homologação.');

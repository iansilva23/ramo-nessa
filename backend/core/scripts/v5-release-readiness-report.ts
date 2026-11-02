import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { auditV5Readiness, formatV5ReadinessMarkdown } from '../src/pricing/v5-release-readiness-audit.js';

// Never connects to PostgreSQL, the VPS, Google or any payment provider.
// Writes to a caller-selected report path or prints the report to stdout.
const report = auditV5Readiness();
const markdown = formatV5ReadinessMarkdown(report);
const requested = process.argv[2];
if (!requested) {
  process.stdout.write(markdown + '\n');
} else {
  const target = resolve(requested);
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, markdown + '\n', 'utf8');
  await writeFile(target.replace(/\.md$/i, '') + '.json',
    JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write('Relatórios estáticos gerados (sem alterar preços): ' + target + '\n');
}

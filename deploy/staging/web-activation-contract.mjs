import { createHash } from 'node:crypto';
export const target = '5247aabd587efa610c9b4cc36d74cbc348048b41';
export const base = '7f6086763d78f64c65d4939151d728e46f51b6fb';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function webCompose(text) {
  const marker = '      - ./Caddyfile:/etc/caddy/Caddyfile:ro\n';
  if (text.split(marker).length !== 2 || text.includes('/srv/web')) throw Error('Compose diferente do esperado.');
  return text.replace(marker, marker + '      - ./web-dist:/srv/web:ro\n');
}
export function coreDelta(text) {
  const entries = text.trim().split('\n').filter(Boolean).map(line => {
    const [status, path, extra] = line.split('\t');
    if (!['A', 'M'].includes(status) || extra || !path?.startsWith('backend/core/') || path.split('/').includes('..')) throw Error('Delta do Core fora do escopo.');
    return { status, path };
  });
  if (!entries.length || !entries.some(e => e.path === 'backend/core/migrations/085_web_push_preferences.sql')) throw Error('Delta do Core incompleto.');
  return entries;
}
export function requireIsolated(report) {
  for (const key of ['passed','migration085Isolated','migrationIdempotent','originalPushRecordsPreserved','nativeOldRepository','nativeAndWebNewRepository','oldMigrationRunner','servicesUnchanged','disposableDatabaseRemoved']) {
    if (report[key] !== true) throw Error('Teste isolado obrigatório: ' + key);
  }
  if (report.target !== target || report.liveMigrationApplied !== false) throw Error('Teste isolado pertence a outro estado.');
}

import { readFile } from 'node:fs/promises';

const caddy = await readFile(new URL('../../deploy/staging/Caddyfile', import.meta.url), 'utf8');
export function webSecurityPolicy(role, origin) {
  const path = { passenger: 'passageiro', driver: 'motorista', admin: 'admin' }[role];
  if (!path) throw new Error('Unknown app security scope');
  const block = caddy.match(new RegExp('  handle_path /' + path + '/\\* \\{([\\s\\S]*?)\\n  \\}'))?.[1];
  const policy = block?.match(/header Content-Security-Policy "([^"]+)"/)?.[1];
  if (!policy) throw new Error('Missing app security policy');
  return policy.replaceAll('{$APP_DOMAIN}', new URL(origin).host);
}

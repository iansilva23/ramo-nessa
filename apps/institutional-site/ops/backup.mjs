import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';

const filename = process.env.INTERESTS_DB_PATH ?? '/var/lib/ramo-site/interests.sqlite';
const directory = join(dirname(filename), 'backups');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const destination = join(directory, 'interests-' + new Date().toISOString().replaceAll(':', '-') + '.sqlite');
const db = new DatabaseSync(filename, { readOnly: true });
try {
  await backup(db, destination);
  chmodSync(destination, 0o600);
  console.log('Backup SQLite consistente criado em ' + destination);
} finally { db.close(); }

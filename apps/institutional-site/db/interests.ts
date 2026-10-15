import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

type Interest = { id: string; name: string; phone: string; region: string; vehicle: string };

export function openInterestStore(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  database.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS driver_interests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      region TEXT NOT NULL,
      vehicle TEXT NOT NULL,
      consent_version TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  const insert = database.prepare('INSERT INTO driver_interests (id, name, phone, region, vehicle, consent_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING');
  return {
    save(value: Interest) {
      insert.run(value.id, value.name, value.phone, value.region, value.vehicle, '2026-10-02', Date.now());
    },
    check() { database.prepare('SELECT 1 FROM driver_interests LIMIT 1').get(); },
    close() { database.close(); },
  };
}

let store: ReturnType<typeof openInterestStore> | undefined;
export function interestStore() {
  store ??= openInterestStore(process.env.INTERESTS_DB_PATH ?? '/var/lib/ramo-site/interests.sqlite');
  return store;
}

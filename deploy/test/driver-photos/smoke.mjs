import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:18765';
const stack = fileURLToPath(new URL('./stack.mjs', import.meta.url));
const photosPath = '/v1/driver/me/verification-photos';
const adminPath = '/v1/admin/driver-verification-photos';
const fields = ['portrait', 'vehicle_front', 'vehicle_rear', 'vehicle_left', 'vehicle_right'];
const image = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAME/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AkALsoAAAAAD/2Q==', 'base64');
const replacement = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAUG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnwENogAAAAAH/9k=', 'base64');

function compose(params, { input, format } = {}) {
  const run = spawnSync(process.execPath, [stack, 'exec', ...params], {
    input, encoding: format, maxBuffer: 32 * 1024 * 1024,
    stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'inherit'],
  });
  assert.equal(run.status, 0, 'Falha no comando do ambiente isolado.');
  return run.stdout;
}
const postgres = (...args) => ['exec', '-T', 'postgres', ...args];
const psql = (database, sql) => compose(postgres('psql', '-v', 'ON_ERROR_STOP=1', '-U',
  'ramonessa', '-d', database, '-At', '-c', sql), { format: 'utf8' }).trim();
async function request(path, status, { token, method = 'GET', body } = {}) {
  const binary = Buffer.isBuffer(body);
  const response = await fetch(base + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'content-type': binary ? 'image/jpeg' : 'application/json' }),
    },
    ...(body === undefined ? {} : { body: binary ? body : JSON.stringify(body) }),
  });
  const payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json() : Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, status, `${method} ${path}: ${payload?.error ?? response.status}`);
  return { response, payload };
}

const admin = JSON.parse(compose(['exec', '-T', 'core', 'node',
  'dist/scripts/create-admin-api-key.js', '--name=Revisão fictícia', '--days=1',
  '--scopes=drivers:documents:read,drivers:documents:write'], { format: 'utf8' })).token;
const sequence = String(randomInt(100000000, 999999999));
let cpf = sequence;
for (const length of [9, 10]) {
  const sum = [...cpf].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
  cpf += String((sum * 10 % 11) % 10);
}

await request('/motorista/', 200);
await request('/administrodo/', 200);
await request(photosPath, 401);
await request(adminPath, 401);

const token = (await request('/v1/auth/driver/password/register', 201, {
  method: 'POST', body: {
    fullName: 'Motorista de teste', phone: '+55889' + sequence.slice(1), email: sequence + '@example.test',
    username: 'teste' + sequence, password: 'FotoTeste2026!-' + sequence,
  },
})).payload.accessToken;
await request('/v1/driver/me/registration', 201, { token, method: 'POST', body: {
  cpf, fullName: 'Motorista de teste',
  vehicle: { plate: 'ABC1D23', make: 'Marca', model: 'Modelo', modelYear: 2024,
    color: 'Branco', categories: ['car'], fourByFour: false, seatCapacity: 4 },
} });
const status = (await request(photosPath, 200, { token })).payload;
const vehicle = '?vehicle=' + encodeURIComponent(status.vehicleId + ':' + status.vehicleRevision);
await request(photosPath + '/submit' + vehicle, 409, { method: 'POST', token });
for (const field of fields) {
  await request(photosPath + '/' + field + vehicle, 201, { token, method: 'PUT', body: image });
}
await request(photosPath + '/submit' + vehicle, 200, { method: 'POST', token });
const queue = (await request(adminPath + '?q=ABC1D23', 200, { token: admin })).payload.photos;
assert.equal(queue.length, 5);
const rear = queue.find((photo) => photo.type === 'vehicle_rear');
const preview = await request(adminPath + '/' + rear.id + '/image', 200, { token: admin });
assert.match(preview.response.headers.get('cache-control'), /no-store/);
assert.equal(preview.payload[0], 0xff);
await request(adminPath + '/' + rear.id + '/review', 200, { token: admin, method: 'PATCH',
  body: { decision: 'rejected', reason: 'Deixe a placa legível.' } });
const updated = (await request(photosPath, 200, { token })).payload;
assert.equal(updated.photos.find((photo) => photo.id === rear.id).reason, 'Deixe a placa legível.');
await request(photosPath + '/vehicle_rear' + vehicle, 201, { token, method: 'PUT', body: replacement });
await request(photosPath + '/submit' + vehicle, 200, { method: 'POST', token });
const revised = (await request(photosPath, 200, { token })).payload.photos.find((photo) => photo.type === 'vehicle_rear');
await request(adminPath + '/' + revised.id + '/review', 200, { token: admin, method: 'PATCH', body: { decision: 'approved' } });
console.log('Cadastro, cinco uploads, revisão, reenvio e aprovação passaram pelo gateway.');

const unit = await mkdtemp(join(tmpdir(), 'ramo-photo-restore-'));
const database = 'ramo_photo_restore_' + sequence;
try {
  // Stop only the test Core so file writes and PostgreSQL cannot diverge across snapshots.
  compose(['stop', 'core']);
  const dump = compose(postgres('pg_dump', '-U', 'ramonessa', '-d', 'ramonessa', '--format=custom', '--no-owner'));
  await writeFile(join(unit, 'database.dump'), dump, { mode: 0o600 });
  const restored = join(unit, 'documents');
  await mkdir(restored, { mode: 0o700 });
  compose(['cp', 'core:/private-documents/.', restored]);
  await chmod(restored, 0o700);
  compose(postgres('createdb', '-U', 'ramonessa', database));
  compose(postgres('pg_restore', '-U', 'ramonessa', '-d', database, '--exit-on-error', '--no-owner'),
    { input: await readFile(join(unit, 'database.dump')) });
  const rows = JSON.parse(psql(database, `SELECT json_agg(json_build_object(
    'id',id,'key',storage_key,'hash',content_sha256,'status',status,'reason',rejection_reason
  )) FROM driver_verification_photos`));
  assert.equal(rows.length, 6);
  assert.equal(rows.find((row) => row.id === revised.id).status, 'approved');
  assert.equal(rows.find((row) => row.id === rear.id).reason, 'Deixe a placa legível.');
  for (const row of rows) {
    assert.match(row.key, /^driver-verification\/[a-f0-9-]{36}\/photo\.jpg$/);
    const archived = await readFile(join(restored, row.key));
    assert.equal(createHash('sha256').update(archived).digest('hex'), row.hash);
  }
  console.log('Restauração isolada recuperou as seis imagens e as decisões do ADM com hashes iguais.');
} finally {
  compose(postgres('dropdb', '--if-exists', '-U', 'ramonessa', database));
  await rm(unit, { recursive: true, force: true });
}

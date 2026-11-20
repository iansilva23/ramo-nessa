import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import sharp from 'sharp';
import { LocalPrivateDocumentStorage } from '../src/drivers/driver-document-private-storage.js';
import { DriverVerificationPhotos } from '../src/drivers/driver-verification-photos.js';

const databaseUrl = process.env.PHOTO_TEST_DATABASE_URL;
test('private drafts, complete submission, per-photo review and vehicle changes', { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  const folder = await mkdtemp(join(tmpdir(), 'rn-photo-test-'));
  const driver = 'photo-test-' + randomUUID();
  const vehicle = randomUUID();
  const storage = new LocalPrivateDocumentStorage(folder);
  const photos = new DriverVerificationPhotos(pool);
  const actor = { kind: 'user' as const, id: 'test-reviewer', name: 'Test' };
  const makeImage = (background: string) => sharp({ create: { width: 512, height: 384, channels: 3, background } })
    .jpeg().withMetadata({ orientation: 1 }).toBuffer();
  try {
    await pool.query(`INSERT INTO driver_profiles (driver_id,full_name,status,created_at,updated_at)
      VALUES ($1,'Pessoa de Teste','pending',now(),now())`, [driver]);
    await pool.query(`INSERT INTO driver_vehicles
      (id,driver_id,plate_normalized,make,model,model_year,color,categories,seat_capacity,status,created_at,updated_at)
      VALUES ($1,$2,'ABC1Y23','Marca','Modelo',2024,'Branco',ARRAY['car'],4,'pending',now(),now())`,
      [vehicle, driver]);

    assert.equal(await photos.canReceiveNewWork(driver), true);
    await photos.setPolicy(true, actor);
    assert.equal(await photos.canReceiveNewWork(driver), false);
    const revision = vehicle + ':1';
    const image = await makeImage('#337766');
    await assert.rejects(photos.upload(driver, 'portrait', revision, Buffer.from([0xff, 0xd8]), storage), /validar a imagem/);
    const portrait = await photos.upload(driver, 'portrait', revision, image, storage);
    assert.equal((await photos.upload(driver, 'portrait', revision, image, storage)).id, portrait.id);
    assert.equal((await stat(join(folder, 'driver-verification', portrait.id, 'photo.jpg'))).mode & 0o777, 0o600);
    await assert.rejects(photos.adminImage(portrait.id, storage, false), /indisponível/);
    await assert.rejects(photos.submit(driver, revision), /cinco fotos/);
    for (const field of ['vehicle_front', 'vehicle_rear', 'vehicle_left', 'vehicle_right'] as const) {
      await photos.upload(driver, field, revision, image, storage);
    }
    assert.equal((await photos.submit(driver, revision)).photos.length, 5);
    const queue = await photos.queue(0, 'ABC1Y23');
    assert.equal(queue.photos.length, 5);
    assert.equal((await sharp(await photos.adminImage(portrait.id, storage, true)).metadata()).width, 256);
    assert.equal((await sharp(await photos.adminImage(portrait.id, storage, false)).metadata()).exif, undefined);

    await photos.review(portrait.id, actor, true, null);
    const rear = queue.photos.find((photo) => photo.type === 'vehicle_rear')!;
    await photos.review(rear.id, actor, false, 'Placa precisa ficar legível.');
    assert.equal((await photos.status(driver)).photos.find((photo) => photo.id === rear.id)?.reason, 'Placa precisa ficar legível.');
    await assert.rejects(photos.review(rear.id, actor, true, null), /revisada/);
    const replacement = await photos.upload(driver, 'vehicle_rear', revision, await makeImage('#666666'), storage);
    assert.notEqual(replacement.id, rear.id);
    assert.equal((await photos.submit(driver, revision)).photos.find((photo) => photo.id === portrait.id)?.status, 'approved');

    for (const photo of (await photos.status(driver)).photos.filter((row) => row.status === 'pending')) {
      await photos.review(photo.id, actor, true, null);
    }
    assert.equal(await photos.canReceiveNewWork(driver), true);
    await pool.query("UPDATE driver_vehicles SET plate_normalized='QRS4Z56' WHERE id=$1", [vehicle]);
    assert.equal(await photos.canReceiveNewWork(driver), false);
    assert.deepEqual((await photos.status(driver)).photos.map((photo) => photo.type), ['portrait']);
    await assert.rejects(photos.upload(driver, 'vehicle_front', revision, image, storage), /mudaram/);
    await assert.rejects(photos.review(replacement.id, actor, true, null), /alterado/);
  } finally {
    await pool.query('DELETE FROM driver_profiles WHERE driver_id=$1', [driver]);
    await pool.end();
    await rm(folder, { recursive: true, force: true });
  }
});

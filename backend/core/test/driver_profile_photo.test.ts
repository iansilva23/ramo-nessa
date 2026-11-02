import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DriverProfilePhotoError,
  driverPhotoPath,
  readDriverProfilePhoto,
  updateDriverProfilePhoto,
} from '../src/drivers/driver-profile-photo-service.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';

async function seededRegistry() {
  const registry = new InMemoryDriverRegistryRepository();
  await registry.upsertProfile({
    driverId: 'driver-photo',
    fullName: 'Motorista Foto',
    status: 'approved',
    createdAt: '2026-09-24T20:00:00.000Z',
    updatedAt: '2026-09-24T20:00:00.000Z',
  });
  return registry;
}

test('foto JPEG válida é persistida e recebe URL versionada', async () => {
  const registry = await seededRegistry();
  const bytes = Buffer.alloc(256, 0);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;

  const profile = await updateDriverProfilePhoto({
    registry,
    driverId: 'driver-photo',
    mimeType: 'image/jpeg',
    dataBase64: bytes.toString('base64'),
    now: new Date('2026-09-24T21:00:00.000Z'),
  });

  assert.equal(profile.photoUpdatedAt, '2026-09-24T21:00:00.000Z');
  const stored = await readDriverProfilePhoto({
    registry,
    driverId: 'driver-photo',
  });
  assert.equal(stored?.mimeType, 'image/jpeg');
  assert.deepEqual(stored?.bytes, bytes);
  assert.equal(
    driverPhotoPath('driver-photo', profile.photoUpdatedAt),
    '/v1/drivers/driver-photo/photo?v=2026-09-24T21%3A00%3A00.000Z',
  );
});

test('conteúdo que não corresponde ao MIME é recusado', async () => {
  const registry = await seededRegistry();
  const bytes = Buffer.alloc(256, 1);

  await assert.rejects(
    updateDriverProfilePhoto({
      registry,
      driverId: 'driver-photo',
      mimeType: 'image/jpeg',
      dataBase64: bytes.toString('base64'),
    }),
    (error: unknown) =>
      error instanceof DriverProfilePhotoError &&
      error.code === 'INVALID_PHOTO_DATA',
  );
});

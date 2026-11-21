import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import type { RideRecord } from '../src/rides/ride.js';
import { driverVerificationPhotoRoutes } from '../src/drivers/driver-verification-photo-routes.js';
import { type DriverVerificationPhotos, VerificationPhotoError } from '../src/drivers/driver-verification-photos.js';
import type { LocalPrivateDocumentStorage } from '../src/drivers/driver-document-private-storage.js';

test('private avatars are restricted to their driver or the passenger of the current ride', async () => {
  const requested: string[] = [];
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const photos = {
    async approvedPortrait(driverId: string) {
      requested.push(driverId);
      return driverId === 'first' ? jpeg : null;
    },
  } as unknown as DriverVerificationPhotos;

  const rideId = '39b34e73-8ab7-480d-8ed2-564c06478258';
  let ride = { id: rideId, passengerId: 'owner', driverId: 'first', state: 'DRIVER_ASSIGNED' } as RideRecord;

  async function readAvatar(driverId?: string, options: {
    method: string; path: string; passengerId?: string;
  } = {
    method: 'GET',
    path: '/v1/driver/me/verification-photos/avatar?driverId=first',
  }) {
    const headers = new Map<string, string | number>();
    let status = 200;
    let body: unknown;
    const handled = await driverVerificationPhotoRoutes({
      request: { method: options.method } as IncomingMessage,
      response: {
        setHeader(name: string, value: string | number) { headers.set(name, value); },
        end(bytes: Buffer) { body = bytes; },
      } as unknown as ServerResponse,
      url: new URL(options.path, 'https://example.invalid'),
      photos,
      rides: { async findById(id) { return id === rideId ? ride : null; } },
      async passenger() {
        if (!options.passengerId) {
          throw new VerificationPhotoError(401, 'UNAUTHENTICATED', 'Sessão ausente.');
        }
        return options.passengerId;
      },
      storage: {} as LocalPrivateDocumentStorage,
      async driver() {
        if (driverId == null) {
          throw new VerificationPhotoError(401, 'UNAUTHENTICATED', 'Sessão ausente.');
        }
        return driverId;
      },
      async admin() { throw new Error('Unexpected admin auth'); },
      openAccount: (_, action) => action(),
      json(_, code, payload) { status = code; body = payload; },
    });
    assert.equal(handled, true);
    return { status, headers, body };
  }

  assert.equal((await readAvatar()).status, 401);
  assert.equal((await readAvatar('second')).status, 404);
  const image = await readAvatar('first');
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(image.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(image.body, jpeg);
  const directUpload = await readAvatar('first', { method: 'PUT', path: '/v1/driver/me/photo' });
  assert.equal(directUpload.status, 409);
  assert.match(JSON.stringify(directUpload.body), /PHOTO_REVIEW_REQUIRED/);
  assert.deepEqual(requested, ['second', 'first']);

  const readRideAvatar = (passengerId?: string, expectedDriver = 'first') => readAvatar(undefined, {
    method: 'GET',
    path: '/v1/rides/' + rideId + '/driver-portrait?driver=' + expectedDriver,
    ...(passengerId ? { passengerId } : {}),
  });
  requested.length = 0;
  assert.equal((await readRideAvatar()).status, 401);
  assert.equal((await readRideAvatar('other')).status, 404);
  assert.equal((await readRideAvatar('owner', 'second')).status, 404);
  assert.deepEqual(requested, []);
  const riderImage = await readRideAvatar('owner');
  assert.equal(riderImage.status, 200);
  assert.equal(riderImage.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(riderImage.body, jpeg);

  ride = { ...ride, state: 'AWAITING_PAYMENT', driverConsentRequired: true, reservedDriverId: 'first' };
  assert.equal((await readRideAvatar('owner')).status, 404);
  ride.driverHoldExpiresAt = new Date(Date.now() + 60_000).toISOString();
  assert.equal((await readRideAvatar('owner')).status, 200);
  ride = { ...ride, state: 'CANCELLED_BY_PASSENGER' };
  assert.equal((await readRideAvatar('owner')).status, 404);
  assert.deepEqual(requested, ['first', 'first']);
});

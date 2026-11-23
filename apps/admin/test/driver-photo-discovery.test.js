import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('photos load only for the driver whose dossier is open', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('let driverPhotoReview = null;');
  const end = app.indexOf('function closeDriverDocumentInspection()', start);
  const card = { hidden: true };
  const target = {};
  const loads = [];
  const state = { token: 'fixture', currentDriver: { driverId: 'driver-2' } };
  let destroys = 0;
  vm.runInNewContext(app.slice(start, end) + `
    loadDriverPhotoReview('driver-1');
    loadDriverPhotoReview('driver-2');
    state.currentDriver = { driverId: 'driver-3' };
    loadDriverPhotoReview('driver-3');
    clearDriverPhotoReview();
  `, {
    state,
    api: {},
    byId: (id) => id === 'driver-photo-review-card' ? card : target,
    hasScope: () => true,
    createDriverPhotoReview: ({ driverId }) => ({
      load: () => loads.push(driverId),
      destroy: () => { destroys++; },
    }),
  });
  assert.deepEqual(loads, ['driver-2', 'driver-3']);
  assert.equal(destroys, 2);
  assert.equal(card.hidden, true);
});

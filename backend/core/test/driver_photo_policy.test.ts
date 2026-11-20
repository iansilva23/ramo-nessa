import assert from 'node:assert/strict';
import test from 'node:test';
import { driverPhotoWorkStatus } from '../src/drivers/driver-photo-policy.js';

const startsAt = new Date('2026-12-01T12:00:00Z');
const deadlineAt = new Date('2026-12-10T12:00:00Z');
const existing = new Date('2026-11-30T12:00:00Z');
const policy = { startsAt, deadlineAt, reviewGraceHours: 24 };
const empty = { approved: 0, submittedOnTime: 0 };
const duringGrace = new Date('2026-12-10T12:00:01Z');

test('existing drivers receive notice before the deadline; new drivers require approval', () => {
  assert.equal(driverPhotoWorkStatus(policy, existing, empty, existing).state, 'off');
  assert.equal(driverPhotoWorkStatus(policy, existing, empty, startsAt).state, 'notice');
  assert.equal(driverPhotoWorkStatus(policy, existing, empty, deadlineAt).allowed, false);
  assert.equal(driverPhotoWorkStatus(policy, startsAt, empty, startsAt).allowed, false);
});

test('only a complete on-time submission earns finite review grace', () => {
  const submitted = { approved: 2, submittedOnTime: 5 };
  assert.equal(driverPhotoWorkStatus(policy, existing, submitted, duringGrace).state, 'review_grace');
  assert.equal(driverPhotoWorkStatus(policy, existing, { ...submitted, submittedOnTime: 4 }, duringGrace).allowed, false);
  assert.equal(driverPhotoWorkStatus(policy, existing, submitted, new Date('2026-12-11T12:00:00Z')).allowed, false);
  assert.equal(driverPhotoWorkStatus(policy, existing, { approved: 5, submittedOnTime: 0 }, duringGrace).allowed, true);
});

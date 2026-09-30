import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminPayoutOwnerAuthorizationError,
  assertAdminPayoutOwner,
  resolvePayoutApproverUserId,
} from '../src/admin/admin-payout-owner-authorization.js';

const ownerId = '11111111-1111-4111-8111-111111111111';

test('payout owner authorization blocks missing production owner id', () => {
  assert.throws(
    () => resolvePayoutApproverUserId({} as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof AdminPayoutOwnerAuthorizationError &&
      error.code === 'PAYOUT_APPROVER_NOT_CONFIGURED',
  );
});

test('payout owner authorization rejects invalid owner id', () => {
  assert.throws(
    () =>
      resolvePayoutApproverUserId({
        ADMIN_PAYOUT_APPROVER_USER_ID: 'not-a-uuid',
      } as NodeJS.ProcessEnv),
    (error: unknown) =>
      error instanceof AdminPayoutOwnerAuthorizationError &&
      error.code === 'PAYOUT_APPROVER_NOT_CONFIGURED',
  );
});

test('only the configured human Admin owner can command protected payouts', () => {
  const env = {
    ADMIN_PAYOUT_APPROVER_USER_ID: ownerId,
  } as NodeJS.ProcessEnv;

  assert.doesNotThrow(() =>
    assertAdminPayoutOwner(
      {
        kind: 'user',
        id: ownerId,
        name: 'Owner',
      },
      env,
    ),
  );

  assert.throws(
    () =>
      assertAdminPayoutOwner(
        {
          kind: 'user',
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Finance Admin',
        },
        env,
      ),
    (error: unknown) =>
      error instanceof AdminPayoutOwnerAuthorizationError &&
      error.code === 'PAYOUT_APPROVER_REQUIRED',
  );

  assert.throws(
    () =>
      assertAdminPayoutOwner(
        {
          kind: 'api_key',
          id: ownerId,
          name: 'Automation key',
        },
        env,
      ),
    (error: unknown) =>
      error instanceof AdminPayoutOwnerAuthorizationError &&
      error.code === 'PAYOUT_APPROVER_REQUIRED',
  );
});

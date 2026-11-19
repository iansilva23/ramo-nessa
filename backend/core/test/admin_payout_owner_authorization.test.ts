import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminPayoutOwnerAuthorizationError,
  assertAdminPayoutOwner,
  isAdminPayoutOwner,
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


test('master mantém controle dos repasses mesmo com aprovador separado ou ainda não configurado', () => {
  const master = {kind:'user' as const, id:ownerId, name:'Ian'};
  for (const env of [
    {ADMIN_OWNER_USER_ID:ownerId},
    {ADMIN_OWNER_USER_ID:ownerId, ADMIN_PAYOUT_APPROVER_USER_ID:'22222222-2222-4222-8222-222222222222'},
  ]) {
    assert.equal(isAdminPayoutOwner(master, env), true);
    assert.doesNotThrow(() => assertAdminPayoutOwner(master, env));
    assert.equal(isAdminPayoutOwner({...master, kind:'api_key'}, env), false);
    assert.equal(isAdminPayoutOwner({...master, id:'33333333-3333-4333-8333-333333333333'}, env), false);
  }
});

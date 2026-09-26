import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminOperationalSettingsError,
  adminOperationalSettingsView,
  updateAdminOperationalSettings,
} from '../src/admin/admin-operational-settings-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryOperationalSettingsRepository } from '../src/config/in-memory-operational-settings-repository.js';

const actor = {
  kind: 'user' as const,
  id: 'admin-operational-settings-test',
  name: 'Admin Operational Settings Test',
};

test('Admin controla oferta e reserva do motorista durante pagamento', async () => {
  const repository = new InMemoryOperationalSettingsRepository();
  const admin = new InMemoryAdminRepository();

  const initial = await adminOperationalSettingsView(repository);
  assert.equal(initial.driverOfferTtlSeconds, 35);
  assert.equal(initial.driverPaymentHoldSeconds, 90);

  const updated = await updateAdminOperationalSettings({
    repository,
    admin,
    actor,
    driverOfferTtlSeconds: 42,
    driverPaymentHoldSeconds: 135,
    showNearbyDrivers: true,
    now: new Date('2026-09-26T18:55:00.000Z'),
  });

  assert.equal(updated.driverOfferTtlSeconds, 42);
  assert.equal(updated.driverPaymentHoldSeconds, 135);
  assert.equal(updated.showNearbyDrivers, true);

  const stored = await repository.get();
  assert.equal(stored.driverPaymentHoldSeconds, 135);

  const audit = await admin.listAudit(10);
  assert.equal(audit[0]?.action, 'operational_settings.updated');
  assert.equal(
    audit[0]?.metadata?.previousDriverPaymentHoldSeconds,
    90,
  );
  assert.equal(
    audit[0]?.metadata?.driverPaymentHoldSeconds,
    135,
  );
});

test('Admin rejeita reserva de pagamento fora de 30 a 300 segundos', async () => {
  const repository = new InMemoryOperationalSettingsRepository();
  const admin = new InMemoryAdminRepository();

  for (const value of [29, 301, 90.5]) {
    await assert.rejects(
      updateAdminOperationalSettings({
        repository,
        admin,
        actor,
        driverPaymentHoldSeconds: value,
      }),
      (error: unknown) =>
        error instanceof AdminOperationalSettingsError &&
        error.code === 'INVALID_DRIVER_PAYMENT_HOLD',
    );
  }
});

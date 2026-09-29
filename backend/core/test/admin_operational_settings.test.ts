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
  assert.equal(initial.noDriverDecisionTimeoutSeconds, 900);
  assert.equal(initial.driverLocationMaxAgeSeconds, 120);
  assert.equal(initial.nearbyDriverMaxDistanceKm, 15);

  const updated = await updateAdminOperationalSettings({
    repository,
    admin,
    actor,
    driverOfferTtlSeconds: 42,
    driverPaymentHoldSeconds: 135,
    noDriverDecisionTimeoutSeconds: 1200,
    driverLocationMaxAgeSeconds: 75,
    nearbyDriverMaxDistanceKm: 8.5,
    showNearbyDrivers: true,
    now: new Date('2026-09-26T18:55:00.000Z'),
  });

  assert.equal(updated.driverOfferTtlSeconds, 42);
  assert.equal(updated.driverPaymentHoldSeconds, 135);
  assert.equal(updated.noDriverDecisionTimeoutSeconds, 1200);
  assert.equal(updated.driverLocationMaxAgeSeconds, 75);
  assert.equal(updated.nearbyDriverMaxDistanceKm, 8.5);
  assert.equal(updated.showNearbyDrivers, true);

  const stored = await repository.get();
  assert.equal(stored.driverPaymentHoldSeconds, 135);
  assert.equal(stored.noDriverDecisionTimeoutSeconds, 1200);
  assert.equal(stored.driverLocationMaxAgeSeconds, 75);
  assert.equal(stored.nearbyDriverMaxDistanceKm, 8.5);

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
  assert.equal(
    audit[0]?.metadata?.previousNoDriverDecisionTimeoutSeconds,
    900,
  );
  assert.equal(
    audit[0]?.metadata?.noDriverDecisionTimeoutSeconds,
    1200,
  );
  assert.equal(
    audit[0]?.metadata?.driverLocationMaxAgeSeconds,
    75,
  );
  assert.equal(
    audit[0]?.metadata?.nearbyDriverMaxDistanceKm,
    8.5,
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


test('Admin rejeita prazo sem motorista fora de 60 a 3600 segundos', async () => {
  const repository = new InMemoryOperationalSettingsRepository();
  const admin = new InMemoryAdminRepository();

  for (const value of [59, 3601, 90.5]) {
    await assert.rejects(
      updateAdminOperationalSettings({
        repository,
        admin,
        actor,
        noDriverDecisionTimeoutSeconds: value,
      }),
      (error: unknown) =>
        error instanceof AdminOperationalSettingsError &&
        error.code === 'INVALID_NO_DRIVER_DECISION_TIMEOUT',
    );
  }
});

test('Admin rejeita parâmetros de localização fora dos limites operacionais', async () => {
  const repository = new InMemoryOperationalSettingsRepository();
  const admin = new InMemoryAdminRepository();

  for (const value of [14, 601, 90.5]) {
    await assert.rejects(
      updateAdminOperationalSettings({
        repository,
        admin,
        actor,
        driverLocationMaxAgeSeconds: value,
      }),
      (error: unknown) =>
        error instanceof AdminOperationalSettingsError &&
        error.code === 'INVALID_DRIVER_LOCATION_MAX_AGE',
    );
  }

  for (const value of [0.49, 100.01, Number.NaN]) {
    await assert.rejects(
      updateAdminOperationalSettings({
        repository,
        admin,
        actor,
        nearbyDriverMaxDistanceKm: value,
      }),
      (error: unknown) =>
        error instanceof AdminOperationalSettingsError &&
        error.code === 'INVALID_NEARBY_DRIVER_MAX_DISTANCE',
    );
  }
});

test('Admin persiste e audita somente a Public Key do Mercado Pago', async () => {
  const repository = new InMemoryOperationalSettingsRepository();
  const admin = new InMemoryAdminRepository();
  const publicKey = 'APP_USR-public-key-admin-1234567890';

  const updated = await updateAdminOperationalSettings({
    repository,
    admin,
    actor,
    mercadoPagoPublicKey: publicKey,
    now: new Date('2026-09-28T06:45:00.000Z'),
  });

  assert.equal(updated.mercadoPagoPublicKey, publicKey);
  assert.equal(
    (await repository.get()).mercadoPagoPublicKey,
    publicKey,
  );

  const audit = await admin.listAudit(10);
  assert.equal(
    audit[0]?.metadata?.mercadoPagoPublicKeyChanged,
    true,
  );
  assert.equal(JSON.stringify(audit[0]).includes(publicKey), false);
});

test('Admin rejeita Public Key malformada do Mercado Pago', async () => {
  const repository = new InMemoryOperationalSettingsRepository();
  const admin = new InMemoryAdminRepository();

  await assert.rejects(
    updateAdminOperationalSettings({
      repository,
      admin,
      actor,
      mercadoPagoPublicKey: 'public key com espaços',
    }),
    (error: unknown) =>
      error instanceof AdminOperationalSettingsError &&
      error.code === 'INVALID_MERCADO_PAGO_PUBLIC_KEY',
  );
});

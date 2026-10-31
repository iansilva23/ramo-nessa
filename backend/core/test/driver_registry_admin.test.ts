import assert from 'node:assert/strict';
import test from 'node:test';

import { issueAdminApiKey } from '../src/admin/admin-auth.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import {
  DriverRegistryError,
  getDriverRegistryForAdmin,
  setDriverRegistryStatusFromAdmin,
  upsertDriverRegistryFromAdmin,
} from '../src/drivers/driver-registry-service.js';
import {
  normalizeBrazilVehiclePlate,
  parseUpsertDriverRegistryRequest,
} from '../src/drivers/driver-registry-validation.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { PostgresDriverRegistryRepository } from '../src/drivers/repositories/postgres-driver-registry-repository.js';
import { PostgresDriverSupplyRepository } from '../src/drivers/repositories/postgres-driver-supply-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

const actor = {
  kind: 'user' as const,
  id: 'admin-driver-registry-test',
  name: 'Admin Registry Test',
};

function registryRequest(plate = 'ABC1D23') {
  return parseUpsertDriverRegistryRequest({
    fullName: 'Motorista Teste da Silva',
    preferredName: 'Motorista Teste',
    vehicle: {
      plate,
      make: 'Toyota',
      model: 'Hilux',
      modelYear: 2024,
      color: 'Branca',
      categories: ['car', 'comfort_black'],
      fourByFour: true,
      seatCapacity: 4,
    },
  });
}

test('placa brasileira é normalizada sem alterar formato válido', () => {
  assert.equal(normalizeBrazilVehiclePlate('abc-1d23'), 'ABC1D23');
  assert.equal(normalizeBrazilVehiclePlate('ABC 1234'), 'ABC1234');
  assert.throws(
    () => normalizeBrazilVehiclePlate('INVALIDA'),
    /placa brasileira é inválida/,
  );
});

test('cadastro motorista + veículo nasce pendente e aprovação é explícita', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const admin = new InMemoryAdminRepository();
  const now = '2026-09-23T23:20:00.000Z';

  await identities.createIdentity({
    id: '11111111-1111-4111-8111-111111111191',
    subjectId: 'driver-registry-one',
    subjectType: 'driver',
    phoneE164: '+5588999991291',
    status: 'suspended',
    createdAt: now,
    updatedAt: now,
  });

  const created = await upsertDriverRegistryFromAdmin({
    identities,
    registry,
    drivers,
    admin,
    actor,
    driverId: 'driver-registry-one',
    data: registryRequest(),
    now: new Date(now),
  });
  assert.equal(created.profile.status, 'pending');
  assert.equal(created.vehicle.status, 'pending');
  assert.equal(created.registryApproved, false);
  assert.equal(created.vehicle.plateNormalized, 'ABC1D23');

  const updated = await upsertDriverRegistryFromAdmin({
    identities,
    registry,
    drivers,
    admin,
    actor,
    driverId: 'driver-registry-one',
    data: parseUpsertDriverRegistryRequest({
      ...registryRequest(),
      fullName: 'Motorista Teste Atualizado',
      vehicle: {
        ...registryRequest().vehicle,
        color: 'Preta',
      },
    }),
    now: new Date('2026-09-23T23:21:00.000Z'),
  });
  assert.equal(updated.profile.status, 'pending');
  assert.equal(updated.vehicle.status, 'pending');
  assert.equal(updated.vehicle.color, 'Preta');

  const approved = await setDriverRegistryStatusFromAdmin({
    registry,
    drivers,
    admin,
    actor,
    driverId: 'driver-registry-one',
    profileStatus: 'approved',
    vehicleStatus: 'approved',
    now: new Date('2026-09-23T23:22:00.000Z'),
  });
  assert.equal(approved.profile.status, 'approved');
  assert.equal(approved.vehicle.status, 'approved');
  assert.equal(approved.registryApproved, true);

  const fetched = await getDriverRegistryForAdmin({
    identities,
    registry,
    driverId: 'driver-registry-one',
  });
  assert.equal(fetched.registryApproved, true);
  assert.equal(fetched.identity.status, 'suspended');

  const audit = await admin.listAudit(10);
  assert.deepEqual(
    audit.map((entry) => entry.action),
    [
      'driver.registry.status_changed',
      'driver.registry.upserted',
      'driver.registry.upserted',
    ],
  );
});

test('suspender cadastro tira motorista da operação sem apagar a corrida/supply', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const admin = new InMemoryAdminRepository();
  const driverId = 'driver-registry-operational';
  const now = '2026-09-23T23:25:00.000Z';

  await identities.createIdentity({
    id: '11111111-1111-4111-8111-111111111192',
    subjectId: driverId,
    subjectType: 'driver',
    phoneE164: '+5588999991295',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  const created = await upsertDriverRegistryFromAdmin({
    identities,
    registry,
    drivers,
    admin,
    actor,
    driverId,
    data: registryRequest('OPS1A23'),
    now: new Date(now),
  });
  await setDriverRegistryStatusFromAdmin({
    registry,
    drivers,
    admin,
    actor,
    driverId,
    profileStatus: 'approved',
    vehicleStatus: 'approved',
    now: new Date('2026-09-23T23:26:00.000Z'),
  });

  await drivers.upsert({
    driverId,
    vehicleId: created.vehicle.id,
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.82017,
    longitude: -40.41467,
    locationUpdatedAt: '2026-09-23T23:26:30.000Z',
    updatedAt: '2026-09-23T23:26:30.000Z',
  });

  const suspended = await setDriverRegistryStatusFromAdmin({
    registry,
    drivers,
    admin,
    actor,
    driverId,
    vehicleStatus: 'suspended',
    now: new Date('2026-09-23T23:27:00.000Z'),
  });

  assert.equal(suspended.registryApproved, false);
  const supply = await drivers.findByDriverId(driverId);
  assert.equal(supply?.online, false);
  assert.equal(supply?.driverId, driverId);
});

test('uma placa não pode ser vinculada a dois motoristas', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const admin = new InMemoryAdminRepository();

  for (const [id, driverId, phone] of [
    ['22222222-2222-4222-8222-222222222291', 'driver-plate-a', '+5588999991292'],
    ['22222222-2222-4222-8222-222222222292', 'driver-plate-b', '+5588999991293'],
  ] as const) {
    await identities.createIdentity({
      id,
      subjectId: driverId,
      subjectType: 'driver',
      phoneE164: phone,
      status: 'suspended',
      createdAt: '2026-09-23T23:30:00.000Z',
      updatedAt: '2026-09-23T23:30:00.000Z',
    });
  }

  await upsertDriverRegistryFromAdmin({
    identities,
    registry,
    drivers,
    admin,
    actor,
    driverId: 'driver-plate-a',
    data: registryRequest('BRA2E24'),
  });

  await assert.rejects(
    () =>
      upsertDriverRegistryFromAdmin({
        identities,
        registry,
        drivers,
        admin,
        actor,
        driverId: 'driver-plate-b',
        data: registryRequest('BRA-2E24'),
      }),
    (error: unknown) =>
      error instanceof DriverRegistryError &&
      error.code === 'VEHICLE_PLATE_CONFLICT',
  );
});

test('cadastro exige identidade de motorista previamente provisionada', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const admin = new InMemoryAdminRepository();

  await assert.rejects(
    () =>
      upsertDriverRegistryFromAdmin({
        identities,
        registry,
        drivers,
        admin,
        actor,
        driverId: 'driver-unknown',
        data: registryRequest(),
      }),
    (error: unknown) =>
      error instanceof DriverRegistryError &&
      error.code === 'DRIVER_NOT_FOUND',
  );
});

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL persiste perfil/veículo e auditoria sem misturar driver_supply',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const identities = new PostgresAuthOtpRepository(pool);
    const registry = new PostgresDriverRegistryRepository(pool);
    const drivers = new PostgresDriverSupplyRepository(pool);
    const admin = new PostgresAdminRepository(pool);
    const driverId = 'driver-registry-postgres';
    const identityId = '33333333-3333-4333-8333-333333333391';
    let keyId = '';

    try {
      await identities.createIdentity({
        id: identityId,
        subjectId: driverId,
        subjectType: 'driver',
        phoneE164: '+5588999991294',
        status: 'suspended',
        createdAt: '2026-09-23T23:40:00.000Z',
        updatedAt: '2026-09-23T23:40:00.000Z',
      });

      const issued = await issueAdminApiKey({
        repository: admin,
        name: 'Registry PG Test',
        scopes: [
          'drivers:profile:read',
          'drivers:profile:write',
          'audit:read',
        ],
        now: new Date('2026-09-23T23:40:00.000Z'),
      });
      keyId = issued.key.id;
      const apiActor = {
        kind: 'api_key' as const,
        id: issued.key.id,
        name: issued.key.name,
      };

      const created = await upsertDriverRegistryFromAdmin({
        identities,
        registry,
        drivers,
        admin,
        actor: apiActor,
        driverId,
        data: registryRequest('PGT1A23'),
        now: new Date('2026-09-23T23:41:00.000Z'),
      });
      assert.equal(created.registryApproved, false);

      const approved = await setDriverRegistryStatusFromAdmin({
        registry,
        drivers,
        admin,
        actor: apiActor,
        driverId,
        profileStatus: 'approved',
        vehicleStatus: 'approved',
        now: new Date('2026-09-23T23:42:00.000Z'),
      });
      assert.equal(approved.registryApproved, true);

      const profileRow = await pool.query<{
        status: string;
        full_name: string;
      }>(
        'SELECT status, full_name FROM driver_profiles WHERE driver_id = $1',
        [driverId],
      );
      assert.equal(profileRow.rows[0]?.status, 'approved');
      assert.equal(
        profileRow.rows[0]?.full_name,
        'Motorista Teste da Silva',
      );

      const vehicleRow = await pool.query<{
        status: string;
        plate_normalized: string;
        four_by_four: boolean;
      }>(
        'SELECT status, plate_normalized, four_by_four FROM driver_vehicles WHERE driver_id = $1',
        [driverId],
      );
      assert.equal(vehicleRow.rows[0]?.status, 'approved');
      assert.equal(vehicleRow.rows[0]?.plate_normalized, 'PGT1A23');
      assert.equal(vehicleRow.rows[0]?.four_by_four, true);

      const supply = await pool.query(
        'SELECT driver_id FROM driver_supply WHERE driver_id = $1',
        [driverId],
      );
      assert.equal(supply.rowCount, 0);

      const auditRows = await pool.query<{ action: string }>(
        `
        SELECT action
        FROM admin_audit_log
        WHERE target_type = 'driver' AND target_id = $1
        ORDER BY created_at
        `,
        [driverId],
      );
      assert.deepEqual(
        auditRows.rows.map((row) => row.action),
        ['driver.registry.upserted', 'driver.registry.status_changed'],
      );
    } finally {
      await pool.query(
        "DELETE FROM admin_audit_log WHERE target_type = 'driver' AND target_id = $1",
        [driverId],
      );
      await pool.query(
        'DELETE FROM driver_vehicles WHERE driver_id = $1',
        [driverId],
      );
      await pool.query(
        'DELETE FROM driver_profiles WHERE driver_id = $1',
        [driverId],
      );
      await pool.query(
        'DELETE FROM auth_identities WHERE id = $1',
        [identityId],
      );
      if (keyId) {
        await pool.query(
          'DELETE FROM admin_api_keys WHERE id = $1',
          [keyId],
        );
      }
      await pool.end();
    }
  },
);

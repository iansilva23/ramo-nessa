import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';
import {
  registryStatusPresentation,
  validateDriverRegistryStatus,
} from '../src/security.js';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type'
          ? 'application/json; charset=utf-8'
          : null;
      },
    },
    async json() {
      return payload;
    },
  };
}

test('status cadastral aceita apenas pending, approved e suspended', () => {
  assert.equal(validateDriverRegistryStatus('pending'), 'pending');
  assert.equal(validateDriverRegistryStatus('approved'), 'approved');
  assert.equal(validateDriverRegistryStatus('suspended'), 'suspended');
  assert.throws(() => validateDriverRegistryStatus('active'));
  assert.equal(registryStatusPresentation('approved').tone, 'success');
  assert.equal(registryStatusPresentation('pending').tone, 'warning');
  assert.equal(registryStatusPresentation('suspended').tone, 'danger');
});

test('cliente Admin consulta, salva e aprova cadastro sem vazar Bearer na URL', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      profile: {
        driverId: 'driver-registry-web',
        fullName: 'Motorista Web',
        status: 'approved',
      },
      vehicle: {
        driverId: 'driver-registry-web',
        plateNormalized: 'ABC1D23',
        make: 'Toyota',
        model: 'Hilux',
        modelYear: 2024,
        color: 'Branca',
        categories: ['car'],
        fourByFour: true,
        seatCapacity: 4,
        status: 'approved',
      },
      registryApproved: true,
    });
  };

  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_registry_web_secret';
  const driverId = 'driver-registry-web';

  await api.getDriverRegistry(token, driverId);
  await api.upsertDriverRegistry(token, {
    driverId,
    fullName: 'Motorista Web',
    preferredName: 'Motorista',
    vehicle: {
      plate: 'ABC1D23',
      make: 'Toyota',
      model: 'Hilux',
      modelYear: 2024,
      color: 'Branca',
      categories: ['car'],
      fourByFour: true,
      seatCapacity: 4,
    },
  });
  await api.setDriverRegistryStatus(token, {
    driverId,
    profileStatus: 'approved',
    vehicleStatus: 'approved',
  });

  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((call) => [call.url, call.options.method]),
    [
      ['/v1/admin/drivers/driver-registry-web/registry', 'GET'],
      ['/v1/admin/drivers/driver-registry-web/registry', 'PUT'],
      [
        '/v1/admin/drivers/driver-registry-web/registry/status',
        'PATCH',
      ],
    ],
  );

  for (const call of calls) {
    assert.equal(call.url.includes(token), false);
    assert.equal(
      call.options.headers.authorization,
      `Bearer ${token}`,
    );
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.cache, 'no-store');
  }

  assert.deepEqual(JSON.parse(calls[1].options.body), {
    fullName: 'Motorista Web',
    preferredName: 'Motorista',
    vehicle: {
      plate: 'ABC1D23',
      make: 'Toyota',
      model: 'Hilux',
      modelYear: 2024,
      color: 'Branca',
      categories: ['car'],
      fourByFour: true,
      seatCapacity: 4,
    },
  });
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    profileStatus: 'approved',
    vehicleStatus: 'approved',
  });
});

test('cliente Admin consulta e altera limite cash individual sem vazar Bearer', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      cashEnabled: true,
      defaultDebtLimitCents: 12000,
      overrideDebtLimitCents: 20000,
      effectiveDebtLimitCents: 20000,
      currentDebtCents: 3000,
      remainingDebtCapacityCents: 17000,
      canAcceptCashRide: true,
      updatedAt: '2026-09-24T03:30:00.000Z',
    });
  };

  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_driver_cash_secret';
  const driverId = 'driver-registry-web';

  await api.getDriverCashPolicy(token, driverId);
  await api.setDriverCashPolicy(token, {
    driverId,
    debtLimitCents: 20000,
  });
  await api.setDriverCashPolicy(token, {
    driverId,
    debtLimitCents: null,
  });

  assert.equal(calls.length, 3);
  assert.equal(
    calls[0].url,
    '/v1/admin/drivers/driver-registry-web/cash-policy',
  );
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(
    calls[1].options.body,
    JSON.stringify({ debtLimitCents: 20000 }),
  );
  assert.equal(
    calls[2].options.body,
    JSON.stringify({ debtLimitCents: null }),
  );

  for (const call of calls) {
    assert.equal(call.url.includes(token), false);
    assert.equal(
      call.options.headers.authorization,
      `Bearer ${token}`,
    );
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.cache, 'no-store');
  }
});

test('HTML do Admin expõe cadastro e aprovação de perfil e veículo', () => {
  const html = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );

  for (const id of [
    'driver-registry-result',
    'driver-registry-overall',
    'driver-registry-form',
    'registry-full-name',
    'registry-plate',
    'registry-model-year',
    'registry-seat-capacity',
    'registry-four-by-four',
    'registry-profile-status',
    'registry-vehicle-status',
    'registry-status-button',
    'driver-cash-policy-status',
    'driver-cash-policy-summary',
    'driver-cash-policy-form',
    'driver-cash-limit-reais',
    'driver-cash-limit-save',
    'driver-cash-limit-reset',
    'driver-cash-policy-note',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../styles.css', import.meta.url),
    'utf8',
  );
  assert.match(app, /loadDriverCashPolicy/);
  assert.match(app, /hasScope\('finance:write'\)/);
  assert.match(app, /currentDriverCashPolicy\.cashEnabled/);
  assert.match(app, /api\.setDriverCashPolicy/);
  assert.match(css, /\.driver-cash-policy-summary/);
  assert.match(css, /\.driver-cash-policy-form/);

  for (const category of [
    'moto',
    'delivery',
    'car',
    'comfort_black',
    'buggy',
  ]) {
    assert.match(
      html,
      new RegExp(
        `name=["']registry-category["'][^>]+value=["']${category}["']`,
      ),
    );
  }
});

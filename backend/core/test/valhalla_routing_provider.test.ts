import assert from 'node:assert/strict';
import test from 'node:test';

import { createRoutingDistanceProviderFromEnv } from '../src/routing/osrm-distance-provider.js';
import {
  ValhallaRoutingProvider,
} from '../src/routing/valhalla-route-provider.js';

function encodePolyline6(
  points: Array<{ latitude: number; longitude: number }>,
): string {
  let lastLatitude = 0;
  let lastLongitude = 0;
  let result = '';

  const encodeDelta = (delta: number): string => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;
    let encoded = '';
    while (value >= 0x20) {
      encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    encoded += String.fromCharCode(value + 63);
    return encoded;
  };

  for (const point of points) {
    const latitude = Math.round(point.latitude * 1e6);
    const longitude = Math.round(point.longitude * 1e6);
    result += encodeDelta(latitude - lastLatitude);
    result += encodeDelta(longitude - lastLongitude);
    lastLatitude = latitude;
    lastLongitude = longitude;
  }

  return result;
}

test('Valhalla normaliza rota, geometria e instruções para os apps', async () => {
  const expectedPoints = [
    { latitude: -2.7956, longitude: -40.5142 },
    { latitude: -2.8, longitude: -40.5 },
  ];
  let capturedBody: unknown;

  const fetcher = (async (_input, init) => {
    capturedBody =
      typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    return new Response(
      JSON.stringify({
        trip: {
          summary: {
            length: 2.5,
            time: 420,
          },
          legs: [
            {
              shape: encodePolyline6(expectedPoints),
              maneuvers: [
                {
                  instruction: 'Siga em frente.',
                  verbal_pre_transition_instruction: 'Siga em frente.',
                  type: 1,
                  length: 2.5,
                  time: 420,
                  begin_shape_index: 0,
                  end_shape_index: 1,
                  street_names: ['Rua Principal'],
                },
              ],
            },
          ],
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  const provider = new ValhallaRoutingProvider(
    'https://routing.example.test',
    5_000,
    fetcher,
  );

  const route = await provider.route({
    from: expectedPoints[0]!,
    to: expectedPoints[1]!,
  });

  assert.deepEqual(capturedBody, {
    locations: [
      {
        lat: expectedPoints[0]!.latitude,
        lon: expectedPoints[0]!.longitude,
        type: 'break',
      },
      {
        lat: expectedPoints[1]!.latitude,
        lon: expectedPoints[1]!.longitude,
        type: 'break',
      },
    ],
    costing: 'auto',
    units: 'kilometers',
    directions_options: {
      units: 'kilometers',
      language: 'pt-BR',
    },
  });
  assert.equal(route.distanceMeters, 2500);
  assert.equal(route.durationSeconds, 420);
  assert.deepEqual(route.points, expectedPoints);
  assert.equal(route.maneuvers.length, 1);
  assert.equal(route.maneuvers[0]?.instruction, 'Siga em frente.');
  assert.equal(route.maneuvers[0]?.distanceMeters, 2500);
  assert.deepEqual(route.maneuvers[0]?.streetNames, ['Rua Principal']);
});

test('Valhalla é também a fonte de distância roteada do matching', async () => {
  const points = [
    { latitude: -2.7956, longitude: -40.5142 },
    { latitude: -2.8, longitude: -40.5 },
  ];

  const fetcher = (async () =>
    new Response(
      JSON.stringify({
        trip: {
          summary: { length: 3.125, time: 500 },
          legs: [{ shape: encodePolyline6(points), maneuvers: [] }],
        },
      }),
      { status: 200 },
    )) as typeof fetch;

  const provider = new ValhallaRoutingProvider(
    'https://routing.example.test/',
    5_000,
    fetcher,
  );

  assert.equal(
    await provider.routeDistanceKm({
      from: points[0]!,
      to: points[1]!,
    }),
    3.125,
  );
});

test('factory usa Valhalla por padrão quando ROUTING_BASE_URL existe', () => {
  const provider = createRoutingDistanceProviderFromEnv({
    ROUTING_BASE_URL: 'https://routing.example.test',
    ROUTING_TIMEOUT_MS: '2500',
  });

  assert.ok(provider instanceof ValhallaRoutingProvider);
});

test('factory mantém OSRM somente quando explicitamente solicitado', () => {
  const provider = createRoutingDistanceProviderFromEnv({
    ROUTING_PROVIDER: 'osrm',
    ROUTING_BASE_URL: 'https://osrm.example.test',
  });

  assert.ok(provider != null);
  assert.equal(provider.constructor.name, 'OsrmRoutingDistanceProvider');
});

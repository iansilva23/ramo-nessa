import assert from 'node:assert/strict';
import test from 'node:test';

import { GoogleRoutesProvider } from '../src/routing/google-routes-provider.js';

function encodePolyline5(
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
    const latitude = Math.round(point.latitude * 1e5);
    const longitude = Math.round(point.longitude * 1e5);
    result += encodeDelta(latitude - lastLatitude);
    result += encodeDelta(longitude - lastLongitude);
    lastLatitude = latitude;
    lastLongitude = longitude;
  }
  return result;
}

test('Google Routes normaliza rota, ETA e manobras', async () => {
  const points = [
    { latitude: -2.7956, longitude: -40.5142 },
    { latitude: -2.7980, longitude: -40.5070 },
    { latitude: -2.8, longitude: -40.5 },
  ];
  let capturedUrl = '';
  let capturedHeaders: HeadersInit | undefined;
  let capturedBody: unknown;

  const fetcher = (async (input, init) => {
    capturedUrl = input.toString();
    capturedHeaders = init?.headers;
    capturedBody =
      typeof init?.body === 'string' ? JSON.parse(init.body) : null;

    return new Response(
      JSON.stringify({
        routes: [
          {
            distanceMeters: 2500,
            duration: '420s',
            polyline: {
              encodedPolyline: encodePolyline5(points),
            },
            legs: [
              {
                steps: [
                  {
                    distanceMeters: 800,
                    staticDuration: '90s',
                    polyline: {
                      encodedPolyline: encodePolyline5([
                        points[0]!,
                        points[1]!,
                      ]),
                    },
                    navigationInstruction: {
                      maneuver: 'TURN_LEFT',
                      instructions: 'Vire à esquerda na Rua Principal.',
                    },
                  },
                  {
                    distanceMeters: 1700,
                    staticDuration: '330s',
                    polyline: {
                      encodedPolyline: encodePolyline5([
                        points[1]!,
                        points[2]!,
                      ]),
                    },
                    navigationInstruction: {
                      maneuver: 'TURN_RIGHT',
                      instructions: 'Vire à direita e siga até o destino.',
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const provider = new GoogleRoutesProvider(
    'server-key',
    'https://routes.example.test/',
    5_000,
    fetcher,
  );

  const route = await provider.route({
    from: points[0]!,
    to: points[1]!,
  });

  assert.equal(
    capturedUrl,
    'https://routes.example.test/directions/v2:computeRoutes',
  );
  const headers = new Headers(capturedHeaders);
  assert.equal(headers.get('x-goog-api-key'), 'server-key');
  assert.match(
    headers.get('x-goog-fieldmask') ?? '',
    /routes\.polyline\.encodedPolyline/,
  );
  assert.match(
    headers.get('x-goog-fieldmask') ?? '',
    /routes\.legs\.steps\.polyline\.encodedPolyline/,
  );
  assert.deepEqual(capturedBody, {
    origin: {
      location: {
        latLng: {
          latitude: points[0]!.latitude,
          longitude: points[0]!.longitude,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: points[1]!.latitude,
          longitude: points[1]!.longitude,
        },
      },
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    polylineQuality: 'HIGH_QUALITY',
    polylineEncoding: 'ENCODED_POLYLINE',
    languageCode: 'pt-BR',
    units: 'METRIC',
  });

  assert.equal(route.distanceMeters, 2500);
  assert.equal(route.durationSeconds, 420);
  assert.deepEqual(route.points, points);
  assert.equal(route.maneuvers.length, 2);
  assert.equal(
    route.maneuvers[0]?.instruction,
    'Vire à esquerda na Rua Principal.',
  );
  assert.equal(route.maneuvers[0]?.type, 7);
  assert.equal(route.maneuvers[0]?.distanceMeters, 800);
  assert.equal(route.maneuvers[0]?.durationSeconds, 90);
  assert.equal(route.maneuvers[0]?.beginShapeIndex, 0);
  assert.equal(route.maneuvers[0]?.endShapeIndex, 1);
  assert.equal(route.maneuvers[1]?.beginShapeIndex, 1);
  assert.equal(route.maneuvers[1]?.endShapeIndex, 2);
});

test('Google Routes fornece distância roteada ao matching', async () => {
  const points = [
    { latitude: -2.7956, longitude: -40.5142 },
    { latitude: -2.81, longitude: -40.45 },
  ];
  const fetcher = (async () =>
    new Response(
      JSON.stringify({
        routes: [
          {
            distanceMeters: 3125,
            duration: '500s',
            polyline: {
              encodedPolyline: encodePolyline5(points),
            },
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  const provider = new GoogleRoutesProvider(
    'server-key',
    'https://routes.example.test/',
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

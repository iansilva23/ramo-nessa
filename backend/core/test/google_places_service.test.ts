import assert from 'node:assert/strict';
import test from 'node:test';

import { GooglePlacesService } from '../src/places/google-places-service.js';

test('Google Places usa field mask e filtro local', async () => {
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
        places: [
          {
            id: 'jeri-place',
            displayName: { text: 'Praça de Jericoacoara' },
            formattedAddress: 'Jericoacoara, Jijoca de Jericoacoara - CE',
            location: {
              latitude: -2.7956,
              longitude: -40.5142,
            },
          },
          {
            id: 'fortaleza-place',
            displayName: { text: 'Fortaleza' },
            formattedAddress: 'Fortaleza - CE',
            location: {
              latitude: -3.7319,
              longitude: -38.5267,
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const service = new GooglePlacesService(
    'server-key',
    'https://places.example.test/v1/',
    5_000,
    fetcher,
  );

  const results = await service.searchText({
    query: 'Praça',
    localOnly: true,
  });

  assert.equal(
    capturedUrl,
    'https://places.example.test/v1/places:searchText',
  );
  const headers = new Headers(capturedHeaders);
  assert.equal(headers.get('x-goog-api-key'), 'server-key');
  assert.match(
    headers.get('x-goog-fieldmask') ?? '',
    /places\.formattedAddress/,
  );
  assert.deepEqual(capturedBody, {
    textQuery: 'Praça',
    pageSize: 6,
    languageCode: 'pt-BR',
    regionCode: 'BR',
    locationBias: {
      rectangle: {
        low: {
          latitude: -2.98,
          longitude: -40.61,
        },
        high: {
          latitude: -2.73,
          longitude: -40.34,
        },
      },
    },
  });

  assert.deepEqual(results, [
    {
      id: 'jeri-place',
      name: 'Praça de Jericoacoara',
      address: 'Jericoacoara, Jijoca de Jericoacoara - CE',
      latitude: -2.7956,
      longitude: -40.5142,
    },
  ]);
});

test('Google Places permite destinos externos aprovados sem filtro local', async () => {
  const fetcher = (async () =>
    new Response(
      JSON.stringify({
        places: [
          {
            id: 'fortaleza-place',
            displayName: { text: 'Fortaleza' },
            formattedAddress: 'Fortaleza - CE',
            location: {
              latitude: -3.7319,
              longitude: -38.5267,
            },
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  const service = new GooglePlacesService(
    'server-key',
    'https://places.example.test/v1/',
    5_000,
    fetcher,
  );

  const results = await service.searchText({
    query: 'Fortaleza, Ceará, Brasil',
    localOnly: false,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, 'fortaleza-place');
});

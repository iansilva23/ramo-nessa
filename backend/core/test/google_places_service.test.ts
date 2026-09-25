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


test('Google Places Autocomplete usa sessão e restrição local', async () => {
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
        suggestions: [
          {
            placePrediction: {
              placeId: 'jeri-place',
              text: {
                text: 'Jericoacoara, Jijoca de Jericoacoara - CE',
              },
              structuredFormat: {
                mainText: { text: 'Jericoacoara' },
                secondaryText: {
                  text: 'Jijoca de Jericoacoara - CE',
                },
              },
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

  const results = await service.autocomplete({
    query: 'Jeri',
    sessionToken: '3519edfe-0f75-4a30-bfe4-7cbd89340b2c',
    localOnly: true,
  });

  assert.equal(
    capturedUrl,
    'https://places.example.test/v1/places:autocomplete',
  );
  const headers = new Headers(capturedHeaders);
  assert.equal(headers.get('x-goog-api-key'), 'server-key');
  assert.match(
    headers.get('x-goog-fieldmask') ?? '',
    /suggestions\.placePrediction\.placeId/,
  );
  assert.match(
    headers.get('x-goog-fieldmask') ?? '',
    /structuredFormat\.mainText\.text/,
  );
  assert.deepEqual(capturedBody, {
    input: 'Jeri',
    sessionToken: '3519edfe-0f75-4a30-bfe4-7cbd89340b2c',
    languageCode: 'pt-BR',
    regionCode: 'BR',
    includedRegionCodes: ['br'],
    locationRestriction: {
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
      placeId: 'jeri-place',
      mainText: 'Jericoacoara',
      secondaryText: 'Jijoca de Jericoacoara - CE',
    },
  ]);
});

test('Place Details encerra a mesma sessão com campos Essentials', async () => {
  let capturedUrl = '';
  let capturedHeaders: HeadersInit | undefined;

  const fetcher = (async (input, init) => {
    capturedUrl = input.toString();
    capturedHeaders = init?.headers;

    return new Response(
      JSON.stringify({
        id: 'jeri-place',
        formattedAddress:
          'Jericoacoara, Jijoca de Jericoacoara - CE, Brasil',
        location: {
          latitude: -2.7956,
          longitude: -40.5142,
        },
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

  const result = await service.placeDetails({
    placeId: 'jeri-place',
    sessionToken: '3519edfe-0f75-4a30-bfe4-7cbd89340b2c',
    localOnly: true,
  });

  const url = new URL(capturedUrl);
  assert.equal(url.pathname, '/v1/places/jeri-place');
  assert.equal(
    url.searchParams.get('sessionToken'),
    '3519edfe-0f75-4a30-bfe4-7cbd89340b2c',
  );
  assert.equal(url.searchParams.get('languageCode'), 'pt-BR');
  assert.equal(url.searchParams.get('regionCode'), 'BR');

  const headers = new Headers(capturedHeaders);
  assert.equal(
    headers.get('x-goog-fieldmask'),
    'id,formattedAddress,location',
  );
  assert.deepEqual(result, {
    id: 'jeri-place',
    address: 'Jericoacoara, Jijoca de Jericoacoara - CE, Brasil',
    latitude: -2.7956,
    longitude: -40.5142,
  });
});

test('Place Details bloqueia resultado fora da área quando localOnly', async () => {
  const fetcher = (async () =>
    new Response(
      JSON.stringify({
        id: 'fortaleza-place',
        formattedAddress: 'Fortaleza - CE, Brasil',
        location: {
          latitude: -3.7319,
          longitude: -38.5267,
        },
      }),
      { status: 200 },
    )) as typeof fetch;

  const service = new GooglePlacesService(
    'server-key',
    'https://places.example.test/v1/',
    5_000,
    fetcher,
  );

  await assert.rejects(
    service.placeDetails({
      placeId: 'fortaleza-place',
      sessionToken: '3519edfe-0f75-4a30-bfe4-7cbd89340b2c',
      localOnly: true,
    }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'OUTSIDE_LOCAL_AREA',
  );
});

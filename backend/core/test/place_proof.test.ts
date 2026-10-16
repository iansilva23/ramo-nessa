import assert from 'node:assert/strict';
import test from 'node:test';

import {
  issueExternalPlaceProof,
  PlaceProofError,
  verifyExternalPlaceProof,
} from '../src/places/place-proof.js';

const secret = 'test-place-proof-secret-' + 'x'.repeat(32);
const now = new Date('2026-09-28T12:00:00.000Z');

test('prova externa válida vincula localidade e coordenadas', () => {
  const proof = issueExternalPlaceProof({
    localityId: 'sobral',
    placeId: 'ChIJSobralGooglePlace',
    latitude: -3.6880,
    longitude: -40.3499,
    secret,
    ttlSeconds: 1800,
    now,
  });

  const payload = verifyExternalPlaceProof({
    proof,
    localityId: 'sobral',
    latitude: -3.6880,
    longitude: -40.3499,
    secret,
    now: new Date('2026-09-28T12:10:00.000Z'),
  });

  assert.equal(payload.localityId, 'sobral');
  assert.equal(payload.placeId, 'ChIJSobralGooglePlace');
});

test('prova externa não pode ser reutilizada para outra localidade', () => {
  const proof = issueExternalPlaceProof({
    localityId: 'sobral',
    placeId: 'ChIJSobralGooglePlace',
    latitude: -3.6880,
    longitude: -40.3499,
    secret,
    now,
  });

  assert.throws(
    () =>
      verifyExternalPlaceProof({
        proof,
        localityId: 'camocim',
        latitude: -3.6880,
        longitude: -40.3499,
        secret,
        now,
      }),
    (error: unknown) =>
      error instanceof PlaceProofError &&
      error.code === 'PLACE_PROOF_MISMATCH',
  );
});

test('prova externa rejeita coordenada deslocada', () => {
  const proof = issueExternalPlaceProof({
    localityId: 'sobral',
    placeId: 'ChIJSobralGooglePlace',
    latitude: -3.6880,
    longitude: -40.3499,
    secret,
    now,
  });

  assert.throws(
    () =>
      verifyExternalPlaceProof({
        proof,
        localityId: 'sobral',
        latitude: -3.75,
        longitude: -40.40,
        secret,
        now,
      }),
    (error: unknown) =>
      error instanceof PlaceProofError &&
      error.code === 'PLACE_PROOF_MISMATCH',
  );
});

test('prova externa expira e assinatura adulterada é rejeitada', () => {
  const proof = issueExternalPlaceProof({
    localityId: 'sobral',
    placeId: 'ChIJSobralGooglePlace',
    latitude: -3.6880,
    longitude: -40.3499,
    secret,
    ttlSeconds: 300,
    now,
  });

  assert.throws(
    () =>
      verifyExternalPlaceProof({
        proof,
        localityId: 'sobral',
        latitude: -3.6880,
        longitude: -40.3499,
        secret,
        now: new Date('2026-09-28T12:06:00.000Z'),
      }),
    (error: unknown) =>
      error instanceof PlaceProofError &&
      error.code === 'PLACE_PROOF_EXPIRED',
  );

  const last = proof.at(-1);
  const tampered = `${proof.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;
  assert.throws(
    () =>
      verifyExternalPlaceProof({
        proof: tampered,
        localityId: 'sobral',
        latitude: -3.6880,
        longitude: -40.3499,
        secret,
        now,
      }),
    PlaceProofError,
  );
});

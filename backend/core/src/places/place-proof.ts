import { createHmac, timingSafeEqual } from 'node:crypto';

export class PlaceProofError extends Error {
  constructor(
    public readonly code:
      | 'PLACE_PROOF_CONFIG_INVALID'
      | 'PLACE_PROOF_INVALID'
      | 'PLACE_PROOF_EXPIRED'
      | 'PLACE_PROOF_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'PlaceProofError';
  }
}

interface PlaceProofPayload {
  v: 1;
  localityId: string;
  placeId: string;
  latitude: number;
  longitude: number;
  issuedAt: number;
  expiresAt: number;
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const earthRadiusMeters = 6371000;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const deltaLat = radians(b.latitude - a.latitude);
  const deltaLon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;
  return earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function resolvePlaceProofSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.PLACE_PROOF_SECRET?.trim() ?? '';
  if (configured.length >= 32) return configured;

  if (env.NODE_ENV === 'production') {
    throw new PlaceProofError(
      'PLACE_PROOF_CONFIG_INVALID',
      'PLACE_PROOF_SECRET com pelo menos 32 caracteres é obrigatório em produção.',
    );
  }

  return 'ramo-nessa-place-proof-development-only-secret';
}

export function resolvePlaceProofTtlSeconds(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.PLACE_PROOF_TTL_SECONDS?.trim();
  if (raw == null || raw === '') return 1800;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < 300 || seconds > 3600) {
    throw new PlaceProofError(
      'PLACE_PROOF_CONFIG_INVALID',
      'PLACE_PROOF_TTL_SECONDS deve ficar entre 300 e 3600.',
    );
  }
  return seconds;
}

export function issueExternalPlaceProof(input: {
  localityId: string;
  placeId: string;
  latitude: number;
  longitude: number;
  secret: string;
  ttlSeconds?: number;
  now?: Date;
}): string {
  const localityId = input.localityId.trim();
  const placeId = input.placeId.trim();
  if (
    localityId.length < 2 ||
    placeId.length < 3 ||
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180 ||
    input.secret.length < 32
  ) {
    throw new PlaceProofError(
      'PLACE_PROOF_INVALID',
      'Não foi possível emitir prova para o destino.',
    );
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = input.ttlSeconds ?? 1800;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 3600) {
    throw new PlaceProofError(
      'PLACE_PROOF_INVALID',
      'Validade da prova de destino é inválida.',
    );
  }

  const payload: PlaceProofPayload = {
    v: 1,
    localityId,
    placeId,
    latitude: input.latitude,
    longitude: input.longitude,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + ttlSeconds,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded, input.secret)}`;
}

export function verifyExternalPlaceProof(input: {
  proof: string;
  localityId: string;
  latitude: number;
  longitude: number;
  secret: string;
  now?: Date;
  maxDistanceMeters?: number;
}): PlaceProofPayload {
  const [encoded, receivedSignature, extra] = input.proof.trim().split('.');
  if (
    !encoded ||
    !receivedSignature ||
    extra != null ||
    input.secret.length < 32
  ) {
    throw new PlaceProofError(
      'PLACE_PROOF_INVALID',
      'Prova do destino externo é inválida.',
    );
  }

  const expectedSignature = signature(encoded, input.secret);
  const received = Buffer.from(receivedSignature, 'base64url');
  const expected = Buffer.from(expectedSignature, 'base64url');
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new PlaceProofError(
      'PLACE_PROOF_INVALID',
      'Prova do destino externo não confere.',
    );
  }

  let payload: PlaceProofPayload;
  try {
    payload = JSON.parse(decode(encoded)) as PlaceProofPayload;
  } catch {
    throw new PlaceProofError(
      'PLACE_PROOF_INVALID',
      'Conteúdo da prova do destino é inválido.',
    );
  }

  if (
    payload.v !== 1 ||
    typeof payload.localityId !== 'string' ||
    typeof payload.placeId !== 'string' ||
    typeof payload.latitude !== 'number' ||
    typeof payload.longitude !== 'number' ||
    typeof payload.issuedAt !== 'number' ||
    typeof payload.expiresAt !== 'number'
  ) {
    throw new PlaceProofError(
      'PLACE_PROOF_INVALID',
      'Conteúdo da prova do destino é incompleto.',
    );
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (payload.expiresAt <= nowSeconds || payload.issuedAt > nowSeconds + 60) {
    throw new PlaceProofError(
      'PLACE_PROOF_EXPIRED',
      'A validação do destino expirou. Selecione o lugar novamente.',
    );
  }

  if (payload.localityId !== input.localityId.trim()) {
    throw new PlaceProofError(
      'PLACE_PROOF_MISMATCH',
      'A prova não pertence à localidade informada.',
    );
  }

  const distance = distanceMeters(
    {
      latitude: payload.latitude,
      longitude: payload.longitude,
    },
    {
      latitude: input.latitude,
      longitude: input.longitude,
    },
  );
  if (distance > (input.maxDistanceMeters ?? 75)) {
    throw new PlaceProofError(
      'PLACE_PROOF_MISMATCH',
      'As coordenadas do destino não correspondem ao lugar validado.',
    );
  }

  return payload;
}

  
// Alias genérico para provas de lugares aprovados pelo Core.
// Mantemos os nomes antigos para compatibilidade com o fluxo externo existente.
export const issuePlaceProof = issueExternalPlaceProof;
export const verifyPlaceProof = verifyExternalPlaceProof;

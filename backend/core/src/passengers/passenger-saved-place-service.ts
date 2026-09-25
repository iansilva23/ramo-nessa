import { randomUUID } from 'node:crypto';

import type {
  PassengerSavedPlaceKind,
  PassengerSavedPlaceRecord,
  PassengerSavedPlaceRepository,
} from './passenger-saved-place-repository.js';

export class PassengerSavedPlaceError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_SAVED_PLACE'
      | 'SAVED_PLACE_LIMIT'
      | 'SAVED_PLACE_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'PassengerSavedPlaceError';
  }
}

function cleanText(
  value: unknown,
  min: number,
  max: number,
  field: string,
): string {
  if (typeof value !== 'string') {
    throw new PassengerSavedPlaceError(
      'INVALID_SAVED_PLACE',
      `${field} inválido.`,
    );
  }
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length < min || text.length > max) {
    throw new PassengerSavedPlaceError(
      'INVALID_SAVED_PLACE',
      `${field} precisa ter entre ${min} e ${max} caracteres.`,
    );
  }
  return text;
}

function coordinates(input: {
  latitude: unknown;
  longitude: unknown;
}): { latitude: number; longitude: number } {
  const latitude =
    typeof input.latitude === 'number'
      ? input.latitude
      : Number(input.latitude);
  const longitude =
    typeof input.longitude === 'number'
      ? input.longitude
      : Number(input.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new PassengerSavedPlaceError(
      'INVALID_SAVED_PLACE',
      'Coordenadas do local salvo são inválidas.',
    );
  }

  return { latitude, longitude };
}

function savedPlaceView(place: PassengerSavedPlaceRecord) {
  return {
    id: place.id,
    kind: place.kind,
    label: place.label,
    name: place.name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    createdAt: place.createdAt,
    updatedAt: place.updatedAt,
  };
}

export async function listPassengerSavedPlaces(input: {
  repository: PassengerSavedPlaceRepository;
  passengerId: string;
}) {
  const items = await input.repository.listByPassenger(
    input.passengerId,
  );
  return { items: items.map(savedPlaceView) };
}

export async function savePassengerSavedPlace(input: {
  repository: PassengerSavedPlaceRepository;
  passengerId: string;
  kind: unknown;
  label?: unknown;
  name: unknown;
  address: unknown;
  latitude: unknown;
  longitude: unknown;
  now?: Date;
}) {
  const kind = input.kind;
  if (
    kind !== 'home' &&
    kind !== 'work' &&
    kind !== 'custom'
  ) {
    throw new PassengerSavedPlaceError(
      'INVALID_SAVED_PLACE',
      'Tipo de local salvo inválido.',
    );
  }

  const typedKind: PassengerSavedPlaceKind = kind;
  const label =
    typedKind === 'home'
      ? 'Casa'
      : typedKind === 'work'
        ? 'Trabalho'
        : cleanText(input.label, 2, 40, 'Nome do favorito');
  const name = cleanText(input.name, 2, 120, 'Local');
  const address = cleanText(
    input.address,
    2,
    240,
    'Endereço',
  );
  const point = coordinates(input);
  const existing = await input.repository.listByPassenger(
    input.passengerId,
  );

  if (
    typedKind === 'custom' &&
    existing.filter((place) => place.kind === 'custom').length >= 20
  ) {
    throw new PassengerSavedPlaceError(
      'SAVED_PLACE_LIMIT',
      'Você pode salvar até 20 locais personalizados.',
    );
  }

  const slot = existing.find(
    (place) => place.kind === typedKind && typedKind !== 'custom',
  );
  const now = (input.now ?? new Date()).toISOString();
  const saved = await input.repository.save({
    id: slot?.id ?? randomUUID(),
    passengerId: input.passengerId,
    kind: typedKind,
    label,
    name,
    address,
    latitude: point.latitude,
    longitude: point.longitude,
    createdAt: slot?.createdAt ?? now,
    updatedAt: now,
  });

  return savedPlaceView(saved);
}

export async function deletePassengerSavedPlace(input: {
  repository: PassengerSavedPlaceRepository;
  passengerId: string;
  id: string;
}): Promise<void> {
  if (!/^[0-9a-fA-F-]{36}$/.test(input.id)) {
    throw new PassengerSavedPlaceError(
      'SAVED_PLACE_NOT_FOUND',
      'Local salvo não encontrado.',
    );
  }

  const deleted = await input.repository.deleteByPassenger({
    passengerId: input.passengerId,
    id: input.id,
  });
  if (!deleted) {
    throw new PassengerSavedPlaceError(
      'SAVED_PLACE_NOT_FOUND',
      'Local salvo não encontrado.',
    );
  }
}

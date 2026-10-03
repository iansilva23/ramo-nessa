import { randomUUID } from 'node:crypto';

import type {
  SavedAddressDetails,
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

function optionalProviderPlaceId(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  return cleanText(value, 3, 256, 'Identificador do lugar');
}

function optionalPricingIdentity(input: {
  providerPlaceId: string | undefined;
  zoneId: unknown;
  localityId: unknown;
}): {
  providerPlaceId?: string;
  approvedPricingZoneId?: 'jericoacoara' | 'jijoca' | 'prea' | 'external';
  approvedPricingLocalityId?: string;
} {
  const zone =
    typeof input.zoneId === 'string' ? input.zoneId.trim() : '';
  const locality =
    typeof input.localityId === 'string' ? input.localityId.trim() : '';

  if (zone === '' && locality === '') {
    return input.providerPlaceId == null
      ? {}
      : { providerPlaceId: input.providerPlaceId };
  }

  if (
    input.providerPlaceId == null ||
    (
      zone !== 'jericoacoara' &&
      zone !== 'jijoca' &&
      zone !== 'prea' &&
      zone !== 'external'
    ) ||
    !/^[a-z0-9][a-z0-9-]{0,119}$/.test(locality)
  ) {
    throw new PassengerSavedPlaceError(
      'INVALID_SAVED_PLACE',
      'Identidade de preço do local salvo é inválida.',
    );
  }

  return {
    providerPlaceId: input.providerPlaceId,
    approvedPricingZoneId: zone,
    approvedPricingLocalityId: locality,
  };
}

function coordinates(input: {
  latitude: unknown;
  longitude: unknown;
}): { latitude: number; longitude: number } {
  if (input.latitude == null || input.longitude == null ||
      input.latitude === '' || input.longitude === '') {
    throw new PassengerSavedPlaceError('INVALID_SAVED_PLACE', 'Coordenadas do local salvo são inválidas.');
  }
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

function addressDetails(value: unknown): SavedAddressDetails | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new PassengerSavedPlaceError('INVALID_SAVED_PLACE', 'Detalhes do endereço inválidos.');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.mapPinned !== 'boolean' || typeof v.noNumber !== 'boolean') {
    throw new PassengerSavedPlaceError('INVALID_SAVED_PLACE', 'Detalhes do endereço inválidos.');
  }
  const optional = (key: string, max: number) => v[key] == null || v[key] === ''
    ? undefined : cleanText(v[key], 1, max, key);
  const houseNumber = optional('houseNumber', 20);
  if (v.mapPinned && !v.noNumber && !houseNumber || v.noNumber && houseNumber) {
    throw new PassengerSavedPlaceError('INVALID_SAVED_PLACE', 'Informe o número ou marque Sem número.');
  }
  const complement = optional('complement', 100);
  const reference = optional('reference', 120);
  return { mapPinned: v.mapPinned, noNumber: v.noNumber,
    ...(houseNumber ? { houseNumber } : {}),
    ...(complement ? { complement } : {}),
    ...(reference ? { reference } : {}) };
}

function savedPlaceView(place: PassengerSavedPlaceRecord) {
  return {
    id: place.id,
    kind: place.kind,
    label: place.label,
    name: place.name,
    address: place.address,
    ...(place.addressDetails == null ? {} : { addressDetails: place.addressDetails }),
    latitude: place.latitude,
    longitude: place.longitude,
    ...(place.providerPlaceId == null
      ? {}
      : { providerPlaceId: place.providerPlaceId }),
    ...(place.approvedPricingZoneId == null
      ? {}
      : { approvedPricingZoneId: place.approvedPricingZoneId }),
    ...(place.approvedPricingLocalityId == null
      ? {}
      : { approvedPricingLocalityId: place.approvedPricingLocalityId }),
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
  id?: unknown;
  addressDetails?: unknown;
  providerPlaceId?: unknown;
  approvedPricingZoneId?: unknown;
  approvedPricingLocalityId?: unknown;
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
  const details = addressDetails(input.addressDetails);
  const providerPlaceId = optionalProviderPlaceId(input.providerPlaceId);
  const pricingIdentity = optionalPricingIdentity({
    providerPlaceId,
    zoneId: input.approvedPricingZoneId,
    localityId: input.approvedPricingLocalityId,
  });
  const existing = await input.repository.listByPassenger(
    input.passengerId,
  );

  if (
    typedKind === 'custom' && input.id == null &&
    existing.filter((place) => place.kind === 'custom').length >= 20
  ) {
    throw new PassengerSavedPlaceError(
      'SAVED_PLACE_LIMIT',
      'Você pode salvar até 20 locais personalizados.',
    );
  }

  const slot = input.id == null ? existing.find(
    (place) => place.kind === typedKind && typedKind !== 'custom',
  ) : existing.find((place) => place.id === input.id && place.kind === typedKind);
  if (input.id != null && slot == null) {
    throw new PassengerSavedPlaceError('SAVED_PLACE_NOT_FOUND', 'Local salvo não encontrado.');
  }
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
    ...(details == null ? {} : { addressDetails: details }),
    ...pricingIdentity,
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

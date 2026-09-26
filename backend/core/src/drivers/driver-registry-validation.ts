import type { ServiceCategory } from '../pricing/types.js';
import type { DriverRegistryStatus } from './driver-registry-repository.js';

export class InvalidDriverRegistryRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDriverRegistryRequestError';
  }
}

export interface UpsertDriverRegistryRequest {
  fullName: string;
  preferredName?: string;
  vehicle: {
    plate: string;
    make: string;
    model: string;
    modelYear: number;
    color: string;
    categories: ServiceCategory[];
    fourByFour: boolean;
    seatCapacity: number;
  };
}

export interface UpdateDriverRegistryStatusRequest {
  profileStatus?: DriverRegistryStatus;
  vehicleStatus?: DriverRegistryStatus;
}

const SERVICE_CATEGORIES = new Set<ServiceCategory>([
  'moto',
  'delivery',
  'car',
  'comfort_black',
  'buggy',
]);

function cleanText(
  value: unknown,
  label: string,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string') {
    throw new InvalidDriverRegistryRequestError(
      `${label} deve ser texto.`,
    );
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new InvalidDriverRegistryRequestError(
      `${label} é inválido.`,
    );
  }
  return normalized;
}

export function normalizeBrazilVehiclePlate(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidDriverRegistryRequestError('placa é obrigatória.');
  }
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized)) {
    throw new InvalidDriverRegistryRequestError(
      'placa brasileira é inválida.',
    );
  }
  return normalized;
}

function parseStatus(
  value: unknown,
  label: string,
): DriverRegistryStatus | undefined {
  if (value == null) return undefined;
  if (
    value !== 'pending' &&
    value !== 'approved' &&
    value !== 'suspended'
  ) {
    throw new InvalidDriverRegistryRequestError(
      `${label} deve ser pending, approved ou suspended.`,
    );
  }
  return value;
}

export function parseUpsertDriverRegistryRequest(
  input: unknown,
): UpsertDriverRegistryRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidDriverRegistryRequestError(
      'body deve ser um objeto.',
    );
  }
  const value = input as Record<string, unknown>;
  const vehicleRaw = value.vehicle;
  if (
    vehicleRaw == null ||
    typeof vehicleRaw !== 'object' ||
    Array.isArray(vehicleRaw)
  ) {
    throw new InvalidDriverRegistryRequestError(
      'vehicle deve ser um objeto.',
    );
  }
  const vehicle = vehicleRaw as Record<string, unknown>;

  const categoriesRaw = vehicle.categories;
  if (
    !Array.isArray(categoriesRaw) ||
    categoriesRaw.length === 0 ||
    categoriesRaw.length > SERVICE_CATEGORIES.size
  ) {
    throw new InvalidDriverRegistryRequestError(
      'categories deve conter ao menos uma categoria válida.',
    );
  }
  const categories = [...new Set(categoriesRaw)];
  if (
    categories.some(
      (category) =>
        typeof category !== 'string' ||
        !SERVICE_CATEGORIES.has(category as ServiceCategory),
    )
  ) {
    throw new InvalidDriverRegistryRequestError(
      'categories contém categoria inválida.',
    );
  }

  if (
    typeof vehicle.modelYear !== 'number' ||
    !Number.isInteger(vehicle.modelYear) ||
    vehicle.modelYear < 1980 ||
    vehicle.modelYear > 2100
  ) {
    throw new InvalidDriverRegistryRequestError(
      'modelYear deve estar entre 1980 e 2100.',
    );
  }
  if (
    typeof vehicle.seatCapacity !== 'number' ||
    !Number.isInteger(vehicle.seatCapacity) ||
    vehicle.seatCapacity < 1 ||
    vehicle.seatCapacity > 12
  ) {
    throw new InvalidDriverRegistryRequestError(
      'seatCapacity deve estar entre 1 e 12.',
    );
  }
  if (typeof vehicle.fourByFour !== 'boolean') {
    throw new InvalidDriverRegistryRequestError(
      'fourByFour deve ser boolean.',
    );
  }

  const preferredName =
    value.preferredName == null || value.preferredName === ''
      ? undefined
      : cleanText(value.preferredName, 'preferredName', 2, 80);

  return {
    fullName: cleanText(value.fullName, 'fullName', 3, 120),
    ...(preferredName == null ? {} : { preferredName }),
    vehicle: {
      plate: normalizeBrazilVehiclePlate(vehicle.plate),
      make: cleanText(vehicle.make, 'make', 2, 60),
      model: cleanText(vehicle.model, 'model', 1, 80),
      modelYear: vehicle.modelYear,
      color: cleanText(vehicle.color, 'color', 2, 40),
      categories: categories as ServiceCategory[],
      fourByFour: vehicle.fourByFour,
      seatCapacity: vehicle.seatCapacity,
    },
  };
}

export function parseUpdateDriverRegistryStatusRequest(
  input: unknown,
): UpdateDriverRegistryStatusRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidDriverRegistryRequestError(
      'body deve ser um objeto.',
    );
  }
  const value = input as Record<string, unknown>;
  const profileStatus = parseStatus(
    value.profileStatus,
    'profileStatus',
  );
  const vehicleStatus = parseStatus(
    value.vehicleStatus,
    'vehicleStatus',
  );

  if (profileStatus == null && vehicleStatus == null) {
    throw new InvalidDriverRegistryRequestError(
      'Informe profileStatus ou vehicleStatus.',
    );
  }

  return {
    ...(profileStatus == null ? {} : { profileStatus }),
    ...(vehicleStatus == null ? {} : { vehicleStatus }),
  };
}

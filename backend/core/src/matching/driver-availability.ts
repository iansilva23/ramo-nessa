import type { ServiceCategory } from '../pricing/types.js';

export type DriverAvailabilityStatus = 'offline' | 'available' | 'busy';

export interface DriverPosition {
  lat: number;
  lon: number;
}

export interface DriverAvailability {
  driverId: string;
  status: DriverAvailabilityStatus;
  serviceCategories: ServiceCategory[];
  passengerCapacity: number;
  jeri4x4Eligible: boolean;
  position: DriverPosition;
  lastSeenAt: string;
}

export function validateDriverAvailability(
  value: DriverAvailability,
): void {
  if (value.driverId.trim().length < 3) {
    throw new Error('driverId inválido.');
  }

  if (
    !Number.isInteger(value.passengerCapacity) ||
    value.passengerCapacity < 1 ||
    value.passengerCapacity > 12
  ) {
    throw new Error('passengerCapacity inválido.');
  }

  if (
    !Number.isFinite(value.position.lat) ||
    value.position.lat < -90 ||
    value.position.lat > 90 ||
    !Number.isFinite(value.position.lon) ||
    value.position.lon < -180 ||
    value.position.lon > 180
  ) {
    throw new Error('Posição do motorista inválida.');
  }

  if (value.serviceCategories.length === 0) {
    throw new Error('Motorista precisa ter ao menos uma categoria.');
  }

  if (Number.isNaN(Date.parse(value.lastSeenAt))) {
    throw new Error('lastSeenAt inválido.');
  }
}

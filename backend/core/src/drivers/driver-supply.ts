import type { ServiceCategory } from '../pricing/types.js';

export interface DriverSupplyRecord {
  driverId: string;
  vehicleId: string;
  categories: ServiceCategory[];
  fourByFour: boolean;
  seatCapacity: number;
  online: boolean;
  busy: boolean;
  latitude: number;
  longitude: number;
  locationUpdatedAt: string;
  updatedAt: string;
}

export class DriverSupplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriverSupplyError';
  }
}

export function validateDriverSupply(
  supply: DriverSupplyRecord,
): DriverSupplyRecord {
  if (supply.driverId.trim().length < 3) {
    throw new DriverSupplyError('driverId inválido.');
  }
  if (supply.vehicleId.trim().length < 3) {
    throw new DriverSupplyError('vehicleId inválido.');
  }
  if (supply.categories.length === 0) {
    throw new DriverSupplyError('Motorista precisa atender alguma categoria.');
  }
  if (!Number.isInteger(supply.seatCapacity) || supply.seatCapacity < 1) {
    throw new DriverSupplyError('seatCapacity inválido.');
  }
  if (
    !Number.isFinite(supply.latitude) ||
    supply.latitude < -90 ||
    supply.latitude > 90 ||
    !Number.isFinite(supply.longitude) ||
    supply.longitude < -180 ||
    supply.longitude > 180
  ) {
    throw new DriverSupplyError('Localização do motorista inválida.');
  }
  if (Number.isNaN(Date.parse(supply.locationUpdatedAt))) {
    throw new DriverSupplyError('locationUpdatedAt inválido.');
  }
  if (Number.isNaN(Date.parse(supply.updatedAt))) {
    throw new DriverSupplyError('updatedAt inválido.');
  }

  return supply;
}

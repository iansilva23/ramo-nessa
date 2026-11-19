export class InvalidDriverRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDriverRequestError';
  }
}

export interface UpdateDriverSupplyRequest {
  online?: boolean;
  latitude?: number;
  longitude?: number;
}

export function parseUpdateDriverSupplyRequest(
  input: unknown,
): UpdateDriverSupplyRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidDriverRequestError('body deve ser um objeto.');
  }

  const record = input as Record<string, unknown>;
  const output: UpdateDriverSupplyRequest = {};

  if ('online' in record) {
    if (typeof record.online !== 'boolean') {
      throw new InvalidDriverRequestError('online deve ser boolean.');
    }
    output.online = record.online;
  }

  const hasLatitude = 'latitude' in record;
  const hasLongitude = 'longitude' in record;
  if (hasLatitude !== hasLongitude) {
    throw new InvalidDriverRequestError(
      'latitude e longitude devem ser enviadas juntas.',
    );
  }

  if (hasLatitude && hasLongitude) {
    if (
      typeof record.latitude !== 'number' ||
      !Number.isFinite(record.latitude) ||
      record.latitude < -90 ||
      record.latitude > 90 ||
      typeof record.longitude !== 'number' ||
      !Number.isFinite(record.longitude) ||
      record.longitude < -180 ||
      record.longitude > 180
    ) {
      throw new InvalidDriverRequestError(
        'latitude/longitude inválidas.',
      );
    }
    output.latitude = record.latitude;
    output.longitude = record.longitude;
  }

  if (output.online == null && output.latitude == null) {
    throw new InvalidDriverRequestError(
      'Envie online ou uma nova localização.',
    );
  }

  return output;
}

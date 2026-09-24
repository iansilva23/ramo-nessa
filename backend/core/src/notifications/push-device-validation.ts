import type {
  PushPlatform,
  PushTokenProvider,
} from './push-device-repository.js';

export class PushDeviceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushDeviceValidationError';
  }
}

export interface PushDeviceRegistrationRequest {
  platform: PushPlatform;
  provider: PushTokenProvider;
  token: string;
}

export function parsePushDeviceRegistration(
  input: unknown,
): PushDeviceRegistrationRequest {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new PushDeviceValidationError(
      'Cadastro do dispositivo é inválido.',
    );
  }

  const value = input as Record<string, unknown>;
  if (value.platform !== 'android' && value.platform !== 'ios') {
    throw new PushDeviceValidationError(
      'Plataforma push deve ser android ou ios.',
    );
  }
  if (value.provider !== 'fcm' && value.provider !== 'apns') {
    throw new PushDeviceValidationError(
      'Provider push deve ser fcm ou apns.',
    );
  }
  if (typeof value.token !== 'string') {
    throw new PushDeviceValidationError('Token push é obrigatório.');
  }

  const token = value.token.trim();
  if (token.length < 20 || token.length > 4096) {
    throw new PushDeviceValidationError(
      'Token push possui tamanho inválido.',
    );
  }

  return {
    platform: value.platform,
    provider: value.provider,
    token,
  };
}

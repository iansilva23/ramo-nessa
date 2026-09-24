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
  appVersion?: string;
  buildNumber?: number;
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

  const rawVersion =
    typeof value.appVersion === 'string'
      ? value.appVersion.trim()
      : '';
  if (
    rawVersion &&
    (rawVersion.length > 40 ||
      !/^[0-9A-Za-z._+-]+$/.test(rawVersion))
  ) {
    throw new PushDeviceValidationError(
      'Versão do app é inválida.',
    );
  }

  let buildNumber: number | undefined;
  if (value.buildNumber != null) {
    if (
      typeof value.buildNumber !== 'number' ||
      !Number.isInteger(value.buildNumber) ||
      value.buildNumber < 1 ||
      value.buildNumber > 2_147_483_647
    ) {
      throw new PushDeviceValidationError(
        'Build do app é inválido.',
      );
    }
    buildNumber = value.buildNumber;
  }

  return {
    platform: value.platform,
    provider: value.provider,
    token,
    ...(rawVersion ? { appVersion: rawVersion } : {}),
    ...(buildNumber == null ? {} : { buildNumber }),
  };
}

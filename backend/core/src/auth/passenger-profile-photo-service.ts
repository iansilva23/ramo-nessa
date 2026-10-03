import type { AuthOtpRepository } from './auth-otp-repository.js';

export const MAX_PASSENGER_PROFILE_PHOTO_BYTES = 1_500_000;
export const MAX_PASSENGER_PROFILE_PHOTO_JSON_BYTES = 2_100_000;

export type PassengerProfilePhotoMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export class PassengerProfilePhotoError extends Error {
  constructor(
    public readonly code:
      | 'PASSENGER_IDENTITY_NOT_FOUND'
      | 'INVALID_PHOTO_TYPE'
      | 'INVALID_PHOTO_DATA'
      | 'PHOTO_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'PassengerProfilePhotoError';
  }
}

function isSupportedMimeType(
  value: string,
): value is PassengerProfilePhotoMimeType {
  return value === 'image/jpeg' ||
    value === 'image/png' ||
    value === 'image/webp';
}

function hasValidMagic(
  bytes: Buffer,
  mimeType: PassengerProfilePhotoMimeType,
): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length &&
      signature.every((value, index) => bytes[index] === value);
  }

  return bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

function decodeBase64Photo(
  raw: unknown,
  mimeType: PassengerProfilePhotoMimeType,
): Buffer {
  if (typeof raw !== 'string') {
    throw new PassengerProfilePhotoError(
      'INVALID_PHOTO_DATA',
      'A imagem enviada é inválida.',
    );
  }

  const normalized = raw.trim();
  if (
    normalized.length < 16 ||
    normalized.length >
      Math.ceil(MAX_PASSENGER_PROFILE_PHOTO_BYTES * 4 / 3) + 8 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw new PassengerProfilePhotoError(
      'INVALID_PHOTO_DATA',
      'A imagem enviada é inválida.',
    );
  }

  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length > MAX_PASSENGER_PROFILE_PHOTO_BYTES) {
    throw new PassengerProfilePhotoError(
      'PHOTO_TOO_LARGE',
      'A foto precisa ter no máximo 1,5 MB.',
    );
  }
  if (bytes.length < 128 || !hasValidMagic(bytes, mimeType)) {
    throw new PassengerProfilePhotoError(
      'INVALID_PHOTO_DATA',
      'O conteúdo não corresponde a uma imagem válida.',
    );
  }

  return bytes;
}

export async function updatePassengerProfilePhoto(input: {
  identities: AuthOtpRepository;
  subjectId: string;
  mimeType: unknown;
  dataBase64: unknown;
  now?: Date;
}) {
  const mimeType =
    typeof input.mimeType === 'string'
      ? input.mimeType.trim().toLowerCase()
      : '';
  if (!isSupportedMimeType(mimeType)) {
    throw new PassengerProfilePhotoError(
      'INVALID_PHOTO_TYPE',
      'Use uma foto JPEG, PNG ou WebP.',
    );
  }

  const bytes = decodeBase64Photo(input.dataBase64, mimeType);
  const updated =
    await input.identities.updatePassengerProfilePhoto({
      subjectId: input.subjectId,
      bytes,
      mimeType,
      updatedAt: (input.now ?? new Date()).toISOString(),
    });

  if (updated == null) {
    throw new PassengerProfilePhotoError(
      'PASSENGER_IDENTITY_NOT_FOUND',
      'Conta de passageiro não encontrada.',
    );
  }

  return updated;
}

export async function readPassengerProfilePhoto(input: {
  identities: AuthOtpRepository;
  subjectId: string;
}) {
  return input.identities.findPassengerProfilePhoto(
    input.subjectId,
  );
}

export function passengerPhotoPath(
  photoUpdatedAt: string | undefined,
): string | undefined {
  if (photoUpdatedAt == null) return undefined;
  return '/v1/passenger/me/photo?v=' +
    encodeURIComponent(photoUpdatedAt);
}

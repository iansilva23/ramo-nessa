import type { AuthIdentityStatus } from '../auth/auth-otp-repository.js';
import type { RideState } from '../rides/ride-state.js';

export class InvalidAdminRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAdminRequestError';
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidAdminRequestError('Corpo da requisição é inválido.');
  }
  return body as Record<string, unknown>;
}

export function parseAdminDriverProvisionRequest(body: unknown): {
  phone: string;
  status: AuthIdentityStatus;
} {
  const value = objectBody(body);
  const phone =
    typeof value.phone === 'string' ? value.phone.trim() : '';
  const rawStatus =
    value.status == null ? 'suspended' : String(value.status);

  if (!phone) {
    throw new InvalidAdminRequestError('phone é obrigatório.');
  }
  if (rawStatus !== 'active' && rawStatus !== 'suspended') {
    throw new InvalidAdminRequestError(
      'status deve ser active ou suspended.',
    );
  }

  return { phone, status: rawStatus };
}

export function parseAdminDriverStatusRequest(body: unknown): {
  status: AuthIdentityStatus;
} {
  const value = objectBody(body);
  const rawStatus = String(value.status ?? '');
  if (rawStatus !== 'active' && rawStatus !== 'suspended') {
    throw new InvalidAdminRequestError(
      'status deve ser active ou suspended.',
    );
  }
  return { status: rawStatus };
}

export function parseAdminAuditLimit(value: string | null): number {
  if (value == null || value.trim() === '') return 50;
  if (!/^\d{1,3}$/.test(value)) {
    throw new InvalidAdminRequestError(
      'limit deve ser inteiro entre 1 e 100.',
    );
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new InvalidAdminRequestError(
      'limit deve ser inteiro entre 1 e 100.',
    );
  }
  return limit;
}


export interface AdminIdentityDirectoryCursor {
  updatedAt: string;
  id: string;
}

export interface AdminIdentityDirectoryQuery {
  status?: AuthIdentityStatus | undefined;
  search?: string | undefined;
  limit: number;
  cursor?: AdminIdentityDirectoryCursor | undefined;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeAdminIdentityDirectoryCursor(input: {
  updatedAt: string;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      u: input.updatedAt,
      i: input.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeAdminIdentityDirectoryCursor(
  value: string,
): AdminIdentityDirectoryCursor {
  if (
    value.length < 8 ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new InvalidAdminRequestError('cursor é inválido.');
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as {
      v?: unknown;
      u?: unknown;
      i?: unknown;
    };
    const updatedAt =
      typeof decoded.u === 'string' ? decoded.u : '';
    const id =
      typeof decoded.i === 'string' ? decoded.i : '';
    if (
      decoded.v !== 1 ||
      !Number.isFinite(Date.parse(updatedAt)) ||
      !UUID_PATTERN.test(id)
    ) {
      throw new Error('invalid');
    }
    return { updatedAt, id };
  } catch {
    throw new InvalidAdminRequestError('cursor é inválido.');
  }
}

export function parseAdminIdentityDirectoryQuery(
  searchParams: URLSearchParams,
): AdminIdentityDirectoryQuery {
  const rawStatus = searchParams.get('status')?.trim() ?? '';
  let status: AuthIdentityStatus | undefined;
  if (rawStatus) {
    if (rawStatus !== 'active' && rawStatus !== 'suspended') {
      throw new InvalidAdminRequestError(
        'status deve ser active ou suspended.',
      );
    }
    status = rawStatus;
  }

  const rawSearch = searchParams.get('query')?.trim() ?? '';
  if (
    rawSearch.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(rawSearch)
  ) {
    throw new InvalidAdminRequestError(
      'query deve ter no máximo 80 caracteres válidos.',
    );
  }

  const rawLimit = searchParams.get('limit')?.trim() ?? '';
  let limit = 25;
  if (rawLimit) {
    if (!/^\d{1,3}$/.test(rawLimit)) {
      throw new InvalidAdminRequestError(
        'limit deve ser inteiro entre 1 e 100.',
      );
    }
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new InvalidAdminRequestError(
        'limit deve ser inteiro entre 1 e 100.',
      );
    }
  }

  const parseDateBoundary = (
    value: string | null,
    field: 'from' | 'to',
  ): string | undefined => {
    const raw = value?.trim() ?? '';
    if (!raw) return undefined;
    if (
      raw.length > 40 ||
      /[\u0000-\u001f\u007f]/.test(raw) ||
      !Number.isFinite(Date.parse(raw))
    ) {
      throw new InvalidAdminRequestError(
        `${field} deve ser uma data ISO válida.`,
      );
    }
    return new Date(raw).toISOString();
  };

  const createdFrom = parseDateBoundary(
    searchParams.get('from'),
    'from',
  );
  const createdTo = parseDateBoundary(
    searchParams.get('to'),
    'to',
  );
  if (
    createdFrom != null &&
    createdTo != null &&
    Date.parse(createdFrom) > Date.parse(createdTo)
  ) {
    throw new InvalidAdminRequestError(
      'from não pode ser posterior a to.',
    );
  }

  const rawCursor = searchParams.get('cursor')?.trim() ?? '';

  return {
    ...(status == null ? {} : { status }),
    ...(rawSearch ? { search: rawSearch } : {}),
    ...(createdFrom == null ? {} : { createdFrom }),
    ...(createdTo == null ? {} : { createdTo }),
    limit,
    ...(rawCursor
      ? { cursor: decodeAdminIdentityDirectoryCursor(rawCursor) }
      : {}),
  };
}


export interface AdminRideDirectoryCursor {
  updatedAt: string;
  id: string;
}

export interface AdminRideDirectoryQuery {
  states?: RideState[] | undefined;
  search?: string | undefined;
  createdFrom?: string | undefined;
  createdTo?: string | undefined;
  limit: number;
  cursor?: AdminRideDirectoryCursor | undefined;
}

const ADMIN_RIDE_STATES: readonly RideState[] = [
  'CREATED',
  'AWAITING_PAYMENT',
  'PAID',
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'PAYMENT_FAILED',
  'NO_DRIVER_FOUND',
  'CANCELLED_BY_PASSENGER',
  'CANCELLED_BY_DRIVER',
  'CANCELLED_BY_ADMIN',
  'REFUND_PENDING',
  'REFUNDED',
];

const ADMIN_ACTIVE_RIDE_STATES: readonly RideState[] = [
  'PAID',
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
];

export function encodeAdminRideDirectoryCursor(input: {
  updatedAt: string;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      u: input.updatedAt,
      i: input.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeAdminRideDirectoryCursor(
  value: string,
): AdminRideDirectoryCursor {
  if (
    value.length < 8 ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new InvalidAdminRequestError('cursor é inválido.');
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as {
      v?: unknown;
      u?: unknown;
      i?: unknown;
    };
    const updatedAt =
      typeof decoded.u === 'string' ? decoded.u : '';
    const id =
      typeof decoded.i === 'string' ? decoded.i : '';
    if (
      decoded.v !== 1 ||
      !Number.isFinite(Date.parse(updatedAt)) ||
      !UUID_PATTERN.test(id)
    ) {
      throw new Error('invalid');
    }
    return { updatedAt, id };
  } catch {
    throw new InvalidAdminRequestError('cursor é inválido.');
  }
}

export function parseAdminRideDirectoryQuery(
  searchParams: URLSearchParams,
): AdminRideDirectoryQuery {
  const rawScope = searchParams.get('scope')?.trim() || 'active';
  if (rawScope !== 'active' && rawScope !== 'all') {
    throw new InvalidAdminRequestError(
      'scope deve ser active ou all.',
    );
  }

  const rawState = searchParams.get('state')?.trim() ?? '';
  let states: RideState[] | undefined;
  if (rawState) {
    if (
      !ADMIN_RIDE_STATES.includes(
        rawState as RideState,
      )
    ) {
      throw new InvalidAdminRequestError(
        'state de corrida é inválido.',
      );
    }
    states = [rawState as RideState];
  } else if (rawScope === 'active') {
    states = [...ADMIN_ACTIVE_RIDE_STATES];
  }

  const rawSearch = searchParams.get('query')?.trim() ?? '';
  if (
    rawSearch.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(rawSearch)
  ) {
    throw new InvalidAdminRequestError(
      'query deve ter no máximo 120 caracteres válidos.',
    );
  }

  const rawLimit = searchParams.get('limit')?.trim() ?? '';
  let limit = 25;
  if (rawLimit) {
    if (!/^\d{1,3}$/.test(rawLimit)) {
      throw new InvalidAdminRequestError(
        'limit deve ser inteiro entre 1 e 100.',
      );
    }
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new InvalidAdminRequestError(
        'limit deve ser inteiro entre 1 e 100.',
      );
    }
  }

  const rawCursor = searchParams.get('cursor')?.trim() ?? '';

  return {
    ...(states == null ? {} : { states }),
    ...(rawSearch ? { search: rawSearch } : {}),
    limit,
    ...(rawCursor
      ? { cursor: decodeAdminRideDirectoryCursor(rawCursor) }
      : {}),
  };
}

import type { AdminActor } from './admin-repository.js';

export class AdminOwnerAuthorizationError extends Error {
  constructor(
    public readonly code:
      | 'ADMIN_OWNER_NOT_CONFIGURED'
      | 'ADMIN_OWNER_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'AdminOwnerAuthorizationError';
  }
}

export function resolveAdminOwnerUserId(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value =
    environment.ADMIN_OWNER_USER_ID?.trim() ||
    environment.ADMIN_PAYOUT_APPROVER_USER_ID?.trim() ||
    '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AdminOwnerAuthorizationError(
      'ADMIN_OWNER_NOT_CONFIGURED',
      'O proprietário do painel administrativo ainda não foi configurado.',
    );
  }
  return value;
}

export function assertAdminOwner(
  actor: AdminActor,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (actor.kind !== 'user' || actor.id !== resolveAdminOwnerUserId(environment)) {
    throw new AdminOwnerAuthorizationError(
      'ADMIN_OWNER_REQUIRED',
      'Esta operação é exclusiva do proprietário do Ramo Nessa.',
    );
  }
}

export function isAdminOwner(
  actor: AdminActor,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (actor.kind !== 'user') return false;
  try {
    return actor.id === resolveAdminOwnerUserId(environment);
  } catch {
    return false;
  }
}

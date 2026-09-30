import type { AdminActor } from './admin-repository.js';

export class AdminPayoutOwnerAuthorizationError extends Error {
  constructor(
    public readonly code:
      | 'PAYOUT_APPROVER_NOT_CONFIGURED'
      | 'PAYOUT_APPROVER_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'AdminPayoutOwnerAuthorizationError';
  }
}

export function resolvePayoutApproverUserId(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value =
    environment.ADMIN_PAYOUT_APPROVER_USER_ID?.trim() ?? '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AdminPayoutOwnerAuthorizationError(
      'PAYOUT_APPROVER_NOT_CONFIGURED',
      'O proprietário autorizado para repasses ainda não foi configurado.',
    );
  }
  return value;
}

export function assertAdminPayoutOwner(
  actor: AdminActor,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const ownerUserId = resolvePayoutApproverUserId(environment);
  if (actor.kind !== 'user' || actor.id !== ownerUserId) {
    throw new AdminPayoutOwnerAuthorizationError(
      'PAYOUT_APPROVER_REQUIRED',
      'Esta operação de repasse é exclusiva do proprietário autorizado.',
    );
  }
}


export function isAdminPayoutOwner(
  actor: AdminActor,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (actor.kind !== 'user') return false;
  try {
    return actor.id === resolvePayoutApproverUserId(environment);
  } catch {
    return false;
  }
}

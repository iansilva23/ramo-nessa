import type { IncomingHttpHeaders } from 'node:http';

import {
  authenticateAdminBearer,
} from './admin-auth.js';
import {
  authenticateAdminHumanSession,
} from './admin-human-auth-service.js';
import type {
  AdminHumanAuthRepository,
} from './admin-human-auth-repository.js';
import type {
  AdminActor,
  AdminRepository,
  AdminScope,
} from './admin-repository.js';

function authorizationValue(
  headers: IncomingHttpHeaders,
): string | null {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

export async function authenticateAdminPrincipal(input: {
  apiKeys: AdminRepository;
  humanAuth: AdminHumanAuthRepository;
  headers: IncomingHttpHeaders;
  requiredScope: AdminScope;
  now?: Date | undefined;
}): Promise<AdminActor> {
  const authorization = authorizationValue(input.headers);

  if (
    authorization?.startsWith(
      'Bearer rn_admin_session_',
    ) === true
  ) {
    const authenticated = await authenticateAdminHumanSession({
      repository: input.humanAuth,
      headers: input.headers,
      requiredScope: input.requiredScope,
      ...(input.now == null ? {} : { now: input.now }),
    });
    return {
      kind: 'user',
      id: authenticated.user.id,
      name: authenticated.user.name,
    };
  }

  const key = await authenticateAdminBearer({
    repository: input.apiKeys,
    headers: input.headers,
    requiredScope: input.requiredScope,
    ...(input.now == null ? {} : { now: input.now }),
  });
  return {
    kind: 'api_key',
    id: key.id,
    name: key.name,
  };
}

export class AdminApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AdminApiError';
    this.status = options.status ?? 0;
    this.code = options.code ?? 'ADMIN_API_ERROR';
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function defaultErrorMessage(status) {
  if (status === 401) return 'Sua sessão não é válida. Entre novamente.';
  if (status === 403) return 'Sua conta não tem permissão para esta operação.';
  if (status === 404) return 'Registro não encontrado.';
  if (status === 409) return 'Existe um conflito com os dados informados.';
  if (status === 429) return 'Muitas tentativas. Aguarde e tente novamente.';
  return 'Não foi possível concluir a operação.';
}

export function createAdminApi(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch não está disponível.');
  }

  async function request(path, options = {}) {
    const headers = {
      accept: 'application/json',
    };
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    let response;
    try {
      response = await fetchImpl(path, {
        method: options.method ?? 'GET',
        headers,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new AdminApiError(
        'Não foi possível conectar ao Core Ramo Nessa.',
        { code: 'NETWORK_ERROR' },
      );
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new AdminApiError(
        payload?.message || defaultErrorMessage(response.status),
        {
          status: response.status,
          code: payload?.error || 'ADMIN_API_ERROR',
          retryAfterSeconds:
            payload?.retryAfterSeconds ??
            (Number(response.headers?.get?.('retry-after')) || null),
        },
      );
    }
    return payload;
  }

  return {
    login({ email, password, totpCode }) {
      return request('/v1/admin/auth/login', {
        method: 'POST',
        body: { email, password, totpCode },
      });
    },

    me(token) {
      return request('/v1/admin/auth/me', { token });
    },

    logout(token) {
      return request('/v1/admin/auth/session', {
        method: 'DELETE',
        token,
      });
    },

    drivers(
      token,
      { query = '', status = '', limit = 25, cursor = null } = {},
    ) {
      const params = new URLSearchParams();
      const normalizedLimit = Math.max(
        1,
        Math.min(100, Math.trunc(limit)),
      );
      params.set('limit', String(normalizedLimit));
      if (String(query).trim()) {
        params.set('query', String(query).trim());
      }
      if (status === 'active' || status === 'suspended') {
        params.set('status', status);
      }
      if (cursor) {
        params.set('cursor', cursor);
      }
      return request(`/v1/admin/drivers?${params.toString()}`, {
        token,
      });
    },

    getDriver(token, driverId) {
      return request(`/v1/admin/drivers/${driverId}/auth`, { token });
    },

    provisionDriver(token, { driverId, phone, status }) {
      return request(`/v1/admin/drivers/${driverId}/auth`, {
        method: 'PUT',
        token,
        body: { phone, status },
      });
    },

    setDriverStatus(token, { driverId, status }) {
      return request(
        `/v1/admin/drivers/${driverId}/auth/status`,
        {
          method: 'PATCH',
          token,
          body: { status },
        },
      );
    },

    audit(token, limit = 50) {
      const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      return request(`/v1/admin/audit?limit=${safeLimit}`, { token });
    },
  };
}

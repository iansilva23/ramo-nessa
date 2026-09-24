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

  async function requestBinary(path, options = {}) {
    const headers = {
      accept: 'application/pdf,image/jpeg,image/png',
    };
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
    }

    let response;
    try {
      response = await fetchImpl(path, {
        method: 'GET',
        headers,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
    } catch {
      throw new AdminApiError(
        'Não foi possível carregar o arquivo privado.',
        { code: 'NETWORK_ERROR' },
      );
    }

    if (!response.ok) {
      const payload = await parseResponse(response);
      throw new AdminApiError(
        payload?.message || defaultErrorMessage(response.status),
        {
          status: response.status,
          code: payload?.error || 'ADMIN_API_ERROR',
        },
      );
    }

    const contentType =
      response.headers?.get?.('content-type')?.split(';')[0]?.trim() ??
      'application/octet-stream';
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, contentType };
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

    dashboard(token) {
      return request('/v1/admin/dashboard', { token });
    },

    fleet(token) {
      return request('/v1/admin/fleet', { token });
    },

    finance(token, limit = 25) {
      const safeLimit = Math.max(
        1,
        Math.min(100, Math.trunc(limit)),
      );
      return request(`/v1/admin/finance?limit=${safeLimit}`, {
        token,
      });
    },

    paymentPolicy(token) {
      return request('/v1/admin/payment-policy', { token });
    },

    updatePaymentPolicy(token, { cashEnabled }) {
      return request('/v1/admin/payment-policy', {
        method: 'PATCH',
        token,
        body: { cashEnabled },
      });
    },

    pricingCatalog(token) {
      return request('/v1/admin/pricing/catalog', { token });
    },

    pricingVersions(token) {
      return request('/v1/admin/pricing/versions', { token });
    },

    getPricingVersion(token, versionId) {
      return request(
        `/v1/admin/pricing/versions/${versionId}`,
        { token },
      );
    },

    createPricingVersion(token) {
      return request('/v1/admin/pricing/versions', {
        method: 'POST',
        token,
      });
    },

    updatePricingVersion(token, { versionId, patch }) {
      return request(
        `/v1/admin/pricing/versions/${versionId}`,
        {
          method: 'PATCH',
          token,
          body: patch,
        },
      );
    },

    publishPricingVersion(token, { versionId, effectiveFrom }) {
      return request(
        `/v1/admin/pricing/versions/${versionId}/publish`,
        {
          method: 'POST',
          token,
          body: effectiveFrom ? { effectiveFrom } : {},
        },
      );
    },

    rides(
      token,
      {
        scope = 'active',
        state = '',
        query = '',
        from = '',
        to = '',
        limit = 25,
        cursor = null,
      } = {},
    ) {
      const params = new URLSearchParams();
      params.set('scope', scope === 'all' ? 'all' : 'active');
      params.set(
        'limit',
        String(Math.max(1, Math.min(100, Math.trunc(limit)))),
      );
      if (String(state).trim()) {
        params.set('state', String(state).trim());
      }
      if (String(query).trim()) {
        params.set('query', String(query).trim());
      }
      if (String(from).trim()) {
        params.set('from', String(from).trim());
      }
      if (String(to).trim()) {
        params.set('to', String(to).trim());
      }
      if (cursor) {
        params.set('cursor', cursor);
      }
      return request(`/v1/admin/rides?${params.toString()}`, {
        token,
      });
    },

    getRide(token, rideId) {
      return request(`/v1/admin/rides/${rideId}`, { token });
    },

    cancelRide(token, { rideId, reason }) {
      return request(
        `/v1/admin/rides/${encodeURIComponent(rideId)}/cancel`,
        {
          method: 'POST',
          token,
          body: { reason },
        },
      );
    },

    passengers(
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
      return request(`/v1/admin/passengers?${params.toString()}`, {
        token,
      });
    },

    getPassenger(token, passengerId) {
      return request(
        `/v1/admin/passengers/${encodeURIComponent(passengerId)}`,
        { token },
      );
    },

    setPassengerStatus(token, { passengerId, status }) {
      return request(
        `/v1/admin/passengers/${encodeURIComponent(passengerId)}/auth/status`,
        {
          method: 'PATCH',
          token,
          body: { status },
        },
      );
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

    getDriverRegistry(token, driverId) {
      return request(
        `/v1/admin/drivers/${driverId}/registry`,
        { token },
      );
    },

    upsertDriverRegistry(
      token,
      { driverId, fullName, preferredName, vehicle },
    ) {
      return request(
        `/v1/admin/drivers/${driverId}/registry`,
        {
          method: 'PUT',
          token,
          body: {
            fullName,
            ...(preferredName ? { preferredName } : {}),
            vehicle,
          },
        },
      );
    },

    setDriverRegistryStatus(
      token,
      { driverId, profileStatus, vehicleStatus },
    ) {
      return request(
        `/v1/admin/drivers/${driverId}/registry/status`,
        {
          method: 'PATCH',
          token,
          body: { profileStatus, vehicleStatus },
        },
      );
    },

    getDriverCashPolicy(token, driverId) {
      return request(
        `/v1/admin/drivers/${encodeURIComponent(driverId)}/cash-policy`,
        { token },
      );
    },

    setDriverCashPolicy(token, { driverId, debtLimitCents }) {
      return request(
        `/v1/admin/drivers/${encodeURIComponent(driverId)}/cash-policy`,
        {
          method: 'PATCH',
          token,
          body: { debtLimitCents },
        },
      );
    },

    getDriverDocuments(token, driverId) {
      return request(
        `/v1/admin/drivers/${driverId}/documents`,
        { token },
      );
    },

    issueDriverDocumentInspection(token, driverId, documentType) {
      return request(
        `/v1/admin/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentType)}/inspection`,
        {
          method: 'POST',
          token,
        },
      );
    },

    readDriverDocumentInspection(token, inspectionToken) {
      return requestBinary(
        `/v1/admin/document-inspection/${encodeURIComponent(inspectionToken)}`,
        { token },
      );
    },

    reviewDriverDocument(
      token,
      { driverId, documentType, status, rejectionReason },
    ) {
      return request(
        `/v1/admin/drivers/${driverId}/documents/${documentType}/review`,
        {
          method: 'PATCH',
          token,
          body: {
            status,
            ...(rejectionReason
              ? { rejectionReason }
              : {}),
          },
        },
      );
    },

    audit(token, options = 50) {
      const config =
        typeof options === 'number'
          ? { limit: options }
          : options ?? {};
      const params = new URLSearchParams();
      params.set(
        'limit',
        String(
          Math.max(
            1,
            Math.min(100, Math.trunc(config.limit ?? 50)),
          ),
        ),
      );
      if (config.actorKind === 'user' || config.actorKind === 'api_key') {
        params.set('actorKind', config.actorKind);
      }
      if (String(config.action ?? '').trim()) {
        params.set('action', String(config.action).trim());
      }
      if (String(config.targetType ?? '').trim()) {
        params.set('targetType', String(config.targetType).trim());
      }
      if (String(config.query ?? '').trim()) {
        params.set('query', String(config.query).trim());
      }
      if (config.cursor) {
        params.set('cursor', config.cursor);
      }
      return request(`/v1/admin/audit?${params.toString()}`, {
        token,
      });
    },
  };
}

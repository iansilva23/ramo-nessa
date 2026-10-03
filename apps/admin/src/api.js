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
      accept: 'application/pdf,image/jpeg,image/png,image/webp',
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

  async function uploadBinary(path, { token, bytes, contentType }) {
    const headers = {
      accept: 'application/json',
      'content-type': contentType,
    };
    if (token) headers.authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetchImpl(path, {
        method: 'PUT',
        headers,
        body: bytes,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
    } catch {
      throw new AdminApiError(
        'Não foi possível enviar o arquivo para o Core Ramo Nessa.',
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

    staff(token) {
      return request('/v1/admin/staff', { token });
    },

    createStaff(token, { name, email, scopes }) {
      return request('/v1/admin/staff', {
        method: 'POST',
        token,
        body: { name, email, scopes },
      });
    },

    updateStaff(token, userId, changes) {
      return request(
        `/v1/admin/staff/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          token,
          body: changes,
        },
      );
    },

    deleteStaff(token, userId) {
      return request(
        `/v1/admin/staff/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
          token,
        },
      );
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

    financePayout(token, payoutId) {
      return request(
        `/v1/admin/finance/payouts/${encodeURIComponent(payoutId)}`,
        { token },
      );
    },

    completeFinancePayout(
      token,
      { payoutId, processor, processorPayoutId },
    ) {
      return request(
        `/v1/admin/finance/payouts/${encodeURIComponent(payoutId)}`,
        {
          method: 'PATCH',
          token,
          body: {
            action: 'paid',
            processor,
            ...(processorPayoutId
              ? { processorPayoutId }
              : {}),
          },
        },
      );
    },

    approveFinancePayout(token, payoutId) {
      return request(
        `/v1/admin/finance/payouts/${encodeURIComponent(payoutId)}`,
        {
          method: 'PATCH',
          token,
          body: { action: 'approved' },
        },
      );
    },

    cancelFinancePayout(token, payoutId) {
      return request(
        `/v1/admin/finance/payouts/${encodeURIComponent(payoutId)}`,
        {
          method: 'PATCH',
          token,
          body: { action: 'cancelled' },
        },
      );
    },

    reconcileFinancePayouts(token) {
      return request('/v1/admin/finance/payouts/reconcile', { method: 'POST', token });
    },

    updateFinancePayoutPolicy(token, { automaticEnabled }) {
      return request('/v1/admin/finance/payout-policy', {
        method: 'PATCH',
        token,
        body: { automaticEnabled },
      });
    },

    createManualFinancePayouts(token, { driverIds, batchId }) {
      return request('/v1/admin/finance/payouts/manual', {
        method: 'POST',
        token,
        body: { driverIds, batchId },
      });
    },

    saveCompanyPayoutDestination(token, { pixKeyType, pixKey }) {
      return request('/v1/admin/finance/company-payout-destination', {
        method: 'PUT',
        token,
        body: { pixKeyType, pixKey },
      });
    },

    createCompanyPayout(token, { amountCents, requestId }) {
      return request('/v1/admin/finance/company-payouts', {
        method: 'POST',
        token,
        body: { amountCents, requestId },
      });
    },

    cancelCompanyPayout(token, payoutId) {
      return request(
        `/v1/admin/finance/company-payouts/${encodeURIComponent(payoutId)}`,
        {
          method: 'PATCH',
          token,
          body: { action: 'cancelled' },
        },
      );
    },

    integrations(token) {
      return request('/v1/admin/integrations', { token });
    },

    operationalSettings(token) {
      return request('/v1/admin/operational-settings', { token });
    },

    updateOperationalSettings(
      token,
      {
        driverOfferTtlSeconds,
        driverPaymentHoldSeconds,
        driverSearchMaxDistanceKm,
        noDriverDecisionTimeoutSeconds,
        driverLocationMaxAgeSeconds,
        nearbyDriverMaxDistanceKm,
        showNearbyDrivers,
        driverDocumentAutoEnforcement,
        mercadoPagoPublicKey,
      },
    ) {
      return request('/v1/admin/operational-settings', {
        method: 'PATCH',
        token,
        body: {
          driverOfferTtlSeconds,
          driverPaymentHoldSeconds,
        driverSearchMaxDistanceKm,
          noDriverDecisionTimeoutSeconds,
          driverLocationMaxAgeSeconds,
          nearbyDriverMaxDistanceKm,
          showNearbyDrivers,
          driverDocumentAutoEnforcement,
          ...(mercadoPagoPublicKey === undefined
            ? {}
            : { mercadoPagoPublicKey }),
        },
      });
    },

    paymentPolicy(token) {
      return request('/v1/admin/payment-policy', { token });
    },

    updatePaymentPolicy(
      token,
      {
        cashEnabled,
        pixEnabled,
        cardEnabled,
        walletEnabled,
        defaultCashDebtLimitCents,
        pixPriceAdjustmentBps,
        cardPriceAdjustmentBps,
      },
    ) {
      return request('/v1/admin/payment-policy', {
        method: 'PATCH',
        token,
        body: {
          cashEnabled,
          pixEnabled,
          cardEnabled,
          walletEnabled,
          defaultCashDebtLimitCents,
          pixPriceAdjustmentBps,
          cardPriceAdjustmentBps,
        },
      });
    },

    communications(token) {
      return request('/v1/admin/communications', { token });
    },

    appAuthHero(token) {
      return requestBinary('/v1/admin/app-auth-branding/hero', { token });
    },

    uploadAppAuthHero(token, { bytes, contentType }) {
      return uploadBinary('/v1/admin/app-auth-branding/hero', {
        token,
        bytes,
        contentType,
      });
    },

    appBrandingIcon(token) {
      return requestBinary('/v1/admin/app-auth-branding/icon', { token });
    },

    uploadAppBrandingIcon(token, { bytes, contentType }) {
      return uploadBinary('/v1/admin/app-auth-branding/icon', {
        token,
        bytes,
        contentType,
      });
    },

    sendNotification(token, payload) {
      return request('/v1/admin/notifications', {
        method: 'POST',
        token,
        body: payload,
      });
    },

    updateReleasePolicy(
      token,
      { appKind, platform, policy },
    ) {
      return request(
        `/v1/admin/release-policy/${encodeURIComponent(appKind)}/${encodeURIComponent(platform)}`,
        {
          method: 'PATCH',
          token,
          body: policy,
        },
      );
    },

    listPromotions(token) { return request('/v1/admin/promotions', { token }); },
    createPromotion(token, campaign) { return request('/v1/admin/promotions', { token, method: 'POST', body: campaign }); },
    setPromotionEnabled(token, id, enabled) {
      return request(`/v1/admin/promotions/${encodeURIComponent(id)}/enabled`, { token, method: 'PATCH', body: { enabled } });
    },

    driverBenefits(token) {
      return request('/v1/admin/driver-benefits', { token });
    },

    setDriverBenefitsEnabled(token, enabled) {
      return request('/v1/admin/driver-benefits/settings', {
        token,
        method: 'PUT',
        body: { enabled },
      });
    },

    createDriverBenefitCampaign(token, campaign) {
      return request('/v1/admin/driver-benefits/campaigns', {
        token,
        method: 'POST',
        body: campaign,
      });
    },

    updateDriverBenefitCampaign(token, campaignId, campaign) {
      return request(
        `/v1/admin/driver-benefits/campaigns/${encodeURIComponent(campaignId)}`,
        {
          token,
          method: 'PATCH',
          body: campaign,
        },
      );
    },

    setDriverBenefitCampaignStatus(token, campaignId, status, expectedUpdatedAt) {
      return request(
        `/v1/admin/driver-benefits/campaigns/${encodeURIComponent(campaignId)}/status`,
        {
          token,
          method: 'PATCH',
          body: { status, expectedUpdatedAt },
        },
      );
    },

    driverBenefitLeaderboard(token, campaignId) {
      return request(
        `/v1/admin/driver-benefits/campaigns/${encodeURIComponent(campaignId)}/leaderboard`,
        { token },
      );
    },

    setDriverBenefitBase(token, driverId, base) {
      return request(
        `/v1/admin/driver-benefits/driver-bases/${encodeURIComponent(driverId)}`,
        {
          token,
          method: 'PUT',
          body: base,
        },
      );
    },

    clearDriverBenefitBase(token, driverId) {
      return request(
        `/v1/admin/driver-benefits/driver-bases/${encodeURIComponent(driverId)}`,
        {
          token,
          method: 'DELETE',
        },
      );
    },
    updateAgencyPromotion(token, promotion) {
      return request('/v1/admin/agency-promotion', {
        method: 'PATCH',
        token,
        body: promotion,
      });
    },

    updateSocialLinks(token, socialLinks) {
      return request('/v1/admin/social-links', {
        method: 'PATCH',
        token,
        body: socialLinks,
      });
    },

    saveAgencyTour(token, slug, tour) {
      return request(
        `/v1/admin/tours/${encodeURIComponent(slug)}`,
        {
          method: 'PUT',
          token,
          body: tour,
        },
      );
    },

    agencyTourCover(token, slug) {
      return requestBinary(
        `/v1/admin/tours/${encodeURIComponent(slug)}/cover`,
        { token },
      );
    },

    uploadAgencyTourCover(
      token,
      slug,
      { bytes, contentType },
    ) {
      return uploadBinary(
        `/v1/admin/tours/${encodeURIComponent(slug)}/cover`,
        { token, bytes, contentType },
      );
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

    updatePricingVersion(
      token,
      { versionId, patch, expectedUpdatedAt },
    ) {
      return request(
        `/v1/admin/pricing/versions/${versionId}`,
        {
          method: 'PATCH',
          token,
          body: {
            ...patch,
            ...(expectedUpdatedAt
              ? { expectedUpdatedAt }
              : {}),
          },
        },
      );
    },

    deletePricingVersion(token, { versionId, expectedUpdatedAt }) {
      return request(
        `/v1/admin/pricing/versions/${versionId}`,
        {
          method: 'DELETE',
          token,
          body: {
            ...(expectedUpdatedAt
              ? { expectedUpdatedAt }
              : {}),
          },
        },
      );
    },

    publishPricingVersion(
      token,
      { versionId, effectiveFrom, expectedUpdatedAt },
    ) {
      return request(
        `/v1/admin/pricing/versions/${versionId}/publish`,
        {
          method: 'POST',
          token,
          body: {
            ...(effectiveFrom ? { effectiveFrom } : {}),
            ...(expectedUpdatedAt
              ? { expectedUpdatedAt }
              : {}),
          },
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

    getPassengerWallet(token, passengerId) {
      return request(
        `/v1/admin/passengers/${encodeURIComponent(passengerId)}/wallet`,
        { token },
      );
    },

    getPassengerNotifications(token, passengerId) {
      return request(
        `/v1/admin/passengers/${encodeURIComponent(passengerId)}/notifications`,
        { token },
      );
    },

    getPassengerPhoto(token, passengerId) {
      return requestBinary(
        `/v1/admin/passengers/${encodeURIComponent(passengerId)}/photo`,
        { token },
      );
    },

    updatePassengerProfile(token, { passengerId, fullName, email }) {
      return request(
        `/v1/admin/passengers/${encodeURIComponent(passengerId)}/profile`,
        {
          method: 'PATCH',
          token,
          body: {
            ...(fullName === undefined ? {} : { fullName }),
            ...(email === undefined ? {} : { email }),
          },
        },
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

    getDriverFinance(token, driverId) {
      return request(
        `/v1/admin/drivers/${encodeURIComponent(driverId)}/finance`,
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

    driverDocumentComplianceAlerts(token) {
      return request(
        '/v1/admin/driver-document-compliance-alerts',
        { token },
      );
    },

    getDriverDocuments(token, driverId) {
      return request(
        `/v1/admin/drivers/${driverId}/documents`,
        { token },
      );
    },

    getDriverDocumentCompliance(token, driverId) {
      return request(
        `/v1/admin/drivers/${encodeURIComponent(driverId)}/document-compliance`,
        { token },
      );
    },

    decideDriverDocumentCompliance(token, { driverId, action }) {
      return request(
        `/v1/admin/drivers/${encodeURIComponent(driverId)}/document-compliance`,
        {
          method: 'PATCH',
          token,
          body: { action },
        },
      );
    },

    notifyDriverDocumentCompliance(token, driverId) {
      return request(
        `/v1/admin/drivers/${encodeURIComponent(driverId)}/document-compliance/notify`,
        {
          method: 'POST',
          token,
        },
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

    privacy(token, options = 50) {
      const config =
        typeof options === 'number'
          ? { limit: options }
          : options ?? {};
      const safeLimit = Math.max(
        1,
        Math.min(100, Math.trunc(config.limit ?? 50)),
      );
      const params = new URLSearchParams();
      params.set('limit', String(safeLimit));
      if (
        config.status === 'open' ||
        config.status === 'in_progress' ||
        config.status === 'completed' ||
        config.status === 'rejected'
      ) {
        params.set('status', config.status);
      }
      if (
        config.cursor?.createdAt &&
        config.cursor?.id
      ) {
        params.set('cursorCreatedAt', config.cursor.createdAt);
        params.set('cursorId', config.cursor.id);
      }
      return request(`/v1/admin/privacy?${params.toString()}`, {
        token,
      });
    },

    publishPrivacyDocument(
      token,
      { documentType, title, content, effectiveAt },
    ) {
      return request(
        `/v1/admin/privacy/documents/${encodeURIComponent(documentType)}`,
        {
          method: 'PUT',
          token,
          body: {
            title,
            content,
            ...(effectiveAt ? { effectiveAt } : {}),
          },
        },
      );
    },

    updatePrivacyRequest(
      token,
      { requestId, status, response },
    ) {
      return request(
        `/v1/admin/privacy/requests/${encodeURIComponent(requestId)}`,
        {
          method: 'PATCH',
          token,
          body: {
            status,
            ...(response ? { response } : {}),
          },
        },
      );
    },

    support(token, options = 50) {
      const config =
        typeof options === 'number'
          ? { limit: options }
          : options ?? {};
      const safeLimit = Math.max(
        1,
        Math.min(100, Math.trunc(config.limit ?? 50)),
      );
      const params = new URLSearchParams();
      params.set('limit', String(safeLimit));
      if (
        config.status === 'open' ||
        config.status === 'in_progress' ||
        config.status === 'resolved' ||
        config.status === 'closed'
      ) {
        params.set('status', config.status);
      }
      if (
        config.cursor?.createdAt &&
        config.cursor?.id
      ) {
        params.set('cursorCreatedAt', config.cursor.createdAt);
        params.set('cursorId', config.cursor.id);
      }
      return request(`/v1/admin/support?${params.toString()}`, {
        token,
      });
    },

    respondSupportTicket(token, { ticketId, response, status }) {
      return request(
        `/v1/admin/support/${encodeURIComponent(ticketId)}`,
        {
          method: 'PATCH',
          token,
          body: { response, status },
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

// MercadoPago.js Secure Fields: PCI values remain inside provider-owned iframes.
// Official contract: https://github.com/mercadopago/sdk-js/blob/main/docs/fields.md
export function createCardFieldsBridge({ window, document }) {
  const sessions = new Map();
  let sdkPromise;
  const error = message => new Error(message);
  const isCardType = type => ['credit_card', 'debit_card'].includes(type);
  const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{20,1024}$/.test(value);

  function safeOrigin() {
    if (window.location.protocol === 'https:') return;
    if (window.location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
    throw error('Abra o aplicativo por uma conexão segura para adicionar o cartão.');
  }

  async function loadSdk() {
    if (typeof window.MercadoPago === 'function') return;
    if (!sdkPromise) {
      sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://sdk.mercadopago.com/js/v2';
        script.async = true;
        const fail = () => {
          clearTimeout(timeout);
          script.remove();
          sdkPromise = undefined;
          reject(error('Não conseguimos carregar o formulário seguro. Tente novamente.'));
        };
        const timeout = setTimeout(fail, 12000);
        script.onerror = fail;
        script.onload = () => {
          if (typeof window.MercadoPago !== 'function') { fail(); return; }
          clearTimeout(timeout);
          resolve();
        };
        document.head.append(script);
      });
    }
    await sdkPromise;
  }

  function dispose(id) {
    const session = sessions.get(id);
    if (!session) return;
    session.disposed = true;
    session.generation++;
    for (const cancel of session.cancelReady) cancel();
    for (const field of session.fields) { try { field.unmount(); } catch {} }
    session.container?.replaceChildren();
    sessions.delete(id);
  }

  function state(session, message = null) {
    if (session.disposed) return;
    session.notify(JSON.stringify({
      ready: session.ready,
      valid: session.ready && !session.lookup && session.method != null &&
        session.fields.every(field => session.validity.get(field) === true),
      loadingMethod: session.lookup,
      paymentMethodId: session.method?.id ?? null,
      error: message,
    }));
  }

  function validateOptions(options) {
    if (!options || !/^[A-Za-z0-9_-]{8,100}$/.test(options.containerId) ||
        typeof options.publicKey !== 'string' || !/^(APP_USR|TEST)-[A-Za-z0-9_-]{15,200}$/.test(options.publicKey) ||
        !Number.isSafeInteger(options.amountCents) || options.amountCents <= 0) {
      throw error('Pagamento por cartão ainda não está configurado neste ambiente.');
    }
    const card = options.savedCard;
    if (card != null && (!/^[A-Za-z0-9_-]{1,100}$/.test(card.id) ||
        !/^[0-9]{4}$/.test(card.lastFourDigits) ||
        !/^[A-Za-z0-9_-]{2,40}$/.test(card.paymentMethodId) || !isCardType(card.paymentMethodType))) {
      throw error('Este cartão salvo não está disponível. Selecione outro.');
    }
  }

  async function mount(optionsJson, notify) {
    safeOrigin();
    const options = JSON.parse(optionsJson);
    validateOptions(options);
    if (sessions.size !== 0) throw error('Conclua ou feche o formulário de cartão aberto.');
    const session = { ...options, notify, fields: [], cancelReady: [], validity: new Map(), generation: 0,
      ready: false, lookup: false, method: null, disposed: false, busy: false };
    sessions.set(options.containerId, session);
    try {
      await loadSdk();
      if (session.disposed) throw error('Cadastro do cartão cancelado.');
      const until = Date.now() + 5000;
      while (!(session.container = document.getElementById(options.containerId))?.isConnected) {
        if (session.disposed || Date.now() > until) throw error('Não conseguimos abrir o formulário seguro.');
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      session.mp = new window.MercadoPago(options.publicKey, {
        locale: 'pt-BR', advancedFraudPrevention: true, trackingDisabled: true,
      });
      session.container.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;width:100%;height:100%;';
      const ready = [];
      const create = (type, title, placeholder, fullWidth = false) => {
        const wrapper = document.createElement('div');
        if (fullWidth) wrapper.style.gridColumn = '1 / -1';
        const label = document.createElement('div');
        label.textContent = title;
        label.style.cssText = 'font:500 13px system-ui;color:#777;margin-bottom:7px';
        const slot = document.createElement('div');
        slot.id = `${options.containerId}-${type}`;
        slot.style.cssText = 'height:56px;border:1px solid #ddd;border-radius:16px;background:#fff;padding:0 14px;box-sizing:border-box;';
        wrapper.append(label, slot);
        session.container.append(wrapper);
        const field = session.mp.fields.create(type, {
          placeholder, srLabel: title, ariaRequired: true,
          style: { color: '#101010', fontSize: '16px', fontFamily: 'Arial', height: '56px' },
        });
        session.fields.push(field);
        ready.push(new Promise((resolve, reject) => {
          let done = false;
          const complete = cause => {
            if (done) return;
            done = true; clearTimeout(timeout);
            if (cause) reject(cause); else resolve();
          };
          const timeout = setTimeout(() => complete(error('O formulário seguro demorou para responder. Tente novamente.')), 12000);
          session.cancelReady.push(() => complete(error('Cadastro do cartão cancelado.')));
          field.on('ready', () => complete());
          field.on('error', () => complete(error('Não conseguimos carregar o campo seguro.')));
        }));
        field.on('validityChange', event => {
          session.validity.set(field, Array.isArray(event?.errorMessages) && event.errorMessages.length === 0);
          state(session);
        });
        field.mount(slot.id);
        return field;
      };
      if (options.savedCard != null) {
        session.method = { id: options.savedCard.paymentMethodId, payment_type_id: options.savedCard.paymentMethodType };
      } else {
        session.number = create('cardNumber', 'Número do cartão', '0000 0000 0000 0000', true);
        create('expirationDate', 'Validade', 'MM/AA');
      }
      session.security = create('securityCode', 'Código de segurança', 'CVV', options.savedCard != null);
      session.security.update({ settings: { mode: 'mandatory', length: options.savedCard?.paymentMethodId === 'amex' ? 4 : 3 } });
      if (session.number) {
        session.number.on('binChange', async ({ bin }) => {
          const generation = ++session.generation;
          session.method = null;
          session.lookup = Boolean(bin);
          state(session);
          if (!bin) return;
          try {
            const methods = await session.mp.getPaymentMethods({ bin });
            const method = methods.results?.find(item => isCardType(item.payment_type_id));
            if (!method || !/^[A-Za-z0-9_-]{2,40}$/.test(method.id)) throw error('unsupported_method');
            const installments = await session.mp.getInstallments({ amount: (options.amountCents / 100).toFixed(2), bin, locale: 'pt-BR' });
            if (session.disposed || generation !== session.generation) return;
            const single = installments.find(item => item.payment_method_id === method.id) ?? installments[0];
            if (!single?.payer_costs?.some(cost => Number(cost.installments) === 1)) {
              throw error('unsupported_installments');
            }
            const settings = method.settings?.[0];
            if (settings?.card_number?.length) session.number.update({ settings: settings.card_number });
            session.security.update({ settings: { mode: 'mandatory', length: settings?.security_code?.length === 4 ? 4 : 3 } });
            session.method = { id: method.id, payment_type_id: method.payment_type_id };
            session.lookup = false;
            state(session);
          } catch {
            if (session.disposed || generation !== session.generation) return;
            session.lookup = false;
            state(session, 'Não conseguimos validar este cartão para pagamento à vista. Confira os dados ou tente outro.');
          }
        });
      }
      await Promise.all(ready);
      if (session.disposed) throw error('Cadastro do cartão cancelado.');
      session.ready = true;
      state(session);
      return JSON.stringify({ mounted: true });
    } catch (cause) {
      if (sessions.get(options.containerId) === session) dispose(options.containerId);
      throw cause;
    }
  }

  async function tokenize(dataJson) {
    const data = JSON.parse(dataJson);
    const session = sessions.get(data.containerId);
    if (!session || session.disposed || session.busy || !session.ready || session.lookup || session.method == null ||
        !session.fields.every(field => session.validity.get(field) === true)) {
      throw error('Confira os dados do cartão para continuar.');
    }
    const nonPCI = session.savedCard != null ? { cardId: session.savedCard.id } : {
      cardholderName: String(data.holderName ?? '').trim(),
      identificationType: 'CPF', identificationNumber: String(data.identificationNumber ?? '').replace(/\D/g, ''),
    };
    if (session.savedCard == null && (nonPCI.cardholderName.length < 2 || nonPCI.cardholderName.length > 100 || !/^[0-9]{11}$/.test(nonPCI.identificationNumber))) {
      throw error('Informe o nome no cartão e o CPF do titular.');
    }
    const generation = session.generation;
    const method = { ...session.method };
    session.busy = true;
    session.container.style.pointerEvents = 'none';
    session.mp.fields.blur();
    try {
      const token = await session.mp.fields.createCardToken(nonPCI);
      if (session.disposed || generation !== session.generation || !validToken(token?.id)) throw error('invalid_token');
      let storageToken;
      if (data.requestStorageToken === true && session.savedCard == null) {
        try {
          const stored = await session.mp.fields.createCardToken(nonPCI);
          if (validToken(stored?.id) && stored.id !== token.id) storageToken = stored.id;
        } catch { /* Payment token remains valid if optional storage token fails. */ }
      }
      if (session.disposed || generation !== session.generation) throw error('cancelled');
      // Explicit whitelist: never return BIN, PAN, expiry, CVV or provider diagnostics.
      return JSON.stringify({ token: token.id, paymentMethodId: method.id, paymentMethodType: method.payment_type_id,
        lastFourDigits: session.savedCard?.lastFourDigits ?? (/^[0-9]{4}$/.test(token.last_four_digits ?? '') ? token.last_four_digits : null),
        ...(storageToken ? { storageToken } : {}),
      });
    } catch {
      throw error('Não conseguimos validar o cartão. Confira os dados e tente novamente.');
    } finally {
      session.busy = false;
      if (!session.disposed) session.container.style.pointerEvents = '';
    }
  }
  return Object.freeze({ mount, tokenize, dispose });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.ramoCardFields = createCardFieldsBridge({ window, document });
}

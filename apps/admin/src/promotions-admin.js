const couponControls = {
  code: 'coupon-code',
  name: 'coupon-name',
  kind: 'coupon-kind',
  value: 'coupon-value',
  percent: 'coupon-percent',
  cap: 'coupon-cap',
  maxRedemptions: 'coupon-maxRedemptions',
  perPassengerLimit: 'coupon-perPassengerLimit',
  perDeviceLimit: 'coupon-perDeviceLimit',
  startsAt: 'coupon-startsAt',
  endsAt: 'coupon-endsAt',
};
const categoryControls = {
  moto: 'coupon-category-moto',
  car: 'coupon-category-car',
  delivery: 'coupon-category-delivery',
  comfort_black: 'coupon-category-comfort_black',
  buggy: 'coupon-category-buggy',
};
const fareControls = {
  moto: 'coupon-fare-moto',
  car: 'coupon-fare-car',
  delivery: 'coupon-fare-delivery',
  comfort_black: 'coupon-fare-comfort_black',
  buggy: 'coupon-fare-buggy',
};
export const promotionKinds = {
  wallet_credit: 'Crédito na carteira',
  fixed_discount: 'Desconto em reais',
  percent_discount: 'Desconto percentual',
  free_ride: 'Corrida grátis',
  fixed_driver_fare: 'Tarifa promocional fixa',
};
export const promotionCategories = {
  moto: 'Moto',
  car: 'Carro',
  delivery: 'Entrega',
  comfort_black: 'Comfort / 4x4',
  buggy: 'Buggy',
};
function integer(value, label, max) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > max)
    throw new Error(`${label} inválido.`);
  return Number(value);
}
export function moneyCents(value, label = 'Valor') {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error(`${label}: informe reais com até duas casas decimais.`);
  const [whole, decimal = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return integer(cents, label, 100000000);
}
export function promotionPayload(values) {
  const categories = values.categories ?? [];
  const payload = {
    code: values.code.trim(),
    name: values.name.trim(),
    kind: values.kind,
    categories,
    maxRedemptions: integer(values.maxRedemptions, 'Limite total', 1000000),
    perPassengerLimit: integer(
      values.perPassengerLimit,
      'Limite por passageiro',
      1000,
    ),
    perDeviceLimit: integer(values.perDeviceLimit, 'Limite por aparelho', 1000),
    enabled: false,
  };
  if (!promotionKinds[payload.kind]) throw new Error('Tipo de cupom inválido.');
  if (['wallet_credit', 'fixed_discount'].includes(payload.kind))
    payload.valueCents = moneyCents(values.value);
  if (payload.kind === 'percent_discount') {
    payload.percentBps = moneyCents(values.percent, 'Percentual');
    if (payload.percentBps > 10000) throw new Error('Percentual máximo: 100%.');
    if (values.cap.trim())
      payload.maxDiscountCents = moneyCents(values.cap, 'Teto do desconto');
  }
  if (payload.kind === 'fixed_driver_fare') {
    if (!categories.length)
      throw new Error('Selecione ao menos uma categoria e defina sua tarifa.');
    payload.fixedDriverFaresByCategory = Object.fromEntries(
      categories.map((category) => [
        category,
        moneyCents(values.fares[category], promotionCategories[category]),
      ]),
    );
  }
  for (const key of ['startsAt', 'endsAt']) {
    if (values[key]) {
      const instant = new Date(values[key]);
      if (!Number.isFinite(instant.getTime()))
        throw new Error('Data inválida.');
      payload[key] = instant.toISOString();
    }
  }
  if (payload.startsAt && payload.endsAt && payload.endsAt <= payload.startsAt)
    throw new Error('O fim deve ser posterior ao início.');
  return payload;
}

export function createPromotionsAdmin({
  root,
  api,
  getToken,
  hasScope,
  onError,
}) {
  let destroyed = false;
  let busy = false;
  const listeners = [];
  const el = (id) => root.querySelector(`#${id}`);
  const form = el('coupon-form');
  const message = el('coupons-message');
  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }
  function show(text, tone = 'neutral') {
    if (destroyed) return;
    message.textContent = text;
    message.dataset.tone = tone;
    message.hidden = !text;
  }
  function sync() {
    const kind = el('coupon-kind').value;
    el('coupon-value-field').hidden = ![
      'wallet_credit',
      'fixed_discount',
    ].includes(kind);
    el('coupon-percent-fields').hidden = kind !== 'percent_discount';
    el('coupon-fares').hidden = kind !== 'fixed_driver_fare';
    for (const category of Object.keys(promotionCategories)) {
      el(fareControls[category]).disabled =
        busy ||
        !hasScope('finance:write') ||
        !el(categoryControls[category]).checked;
    }
  }
  function lock(value) {
    busy = value;
    for (const input of form.querySelectorAll('input,select,button'))
      input.disabled = value || !hasScope('finance:write');
    el('coupons-refresh').disabled = value;
    for (const button of el('coupon-list').querySelectorAll('button'))
      button.disabled = value || !hasScope('finance:write');
    sync();
  }
  const money = (cents) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  function render(campaigns) {
    if (destroyed) return;
    const list = el('coupon-list');
    list.replaceChildren();
    if (!campaigns.length) {
      const p = document.createElement('p');
      p.textContent = 'Nenhuma campanha cadastrada.';
      list.append(p);
      return;
    }
    for (const campaign of campaigns) {
      const card = document.createElement('article');
      card.className = 'panel-card';
      const title = document.createElement('h3');
      title.textContent = `${campaign.code} — ${campaign.name}`;
      const detail = document.createElement('p');
      let benefit = promotionKinds[campaign.kind] ?? campaign.kind;
      if (campaign.valueCents != null)
        benefit += `: ${money(campaign.valueCents)}`;
      if (campaign.percentBps != null)
        benefit += `: ${campaign.percentBps / 100}%${campaign.maxDiscountCents ? ` (até ${money(campaign.maxDiscountCents)})` : ''}`;
      if (campaign.fixedDriverFaresByCategory)
        benefit +=
          ': ' +
          Object.entries(campaign.fixedDriverFaresByCategory)
            .map(
              ([key, value]) => `${promotionCategories[key]} ${money(value)}`,
            )
            .join(' / ');
      else if (campaign.fixedDriverFareCents)
        benefit += `: ${money(campaign.fixedDriverFareCents)}`;
      detail.textContent = benefit;
      const limits = document.createElement('p');
      limits.className = 'muted-copy';
      const date = (value) =>
        value ? new Date(value).toLocaleString('pt-BR') : 'Sem limite de data';
      const expired =
        campaign.endsAt && new Date(campaign.endsAt).getTime() <= Date.now();
      const future =
        campaign.startsAt && new Date(campaign.startsAt).getTime() > Date.now();
      limits.textContent = `${campaign.enabled ? (expired ? 'Expirada' : future ? 'Agendada' : 'Ativa') : 'Desativada'} · Total: ${campaign.maxRedemptions} · Por passageiro: ${campaign.perPassengerLimit} · Por aparelho: ${campaign.perDeviceLimit}. Categorias: ${campaign.categories.length ? campaign.categories.map((key) => promotionCategories[key]).join(', ') : 'Todas'}. Início: ${date(campaign.startsAt)}. Fim: ${date(campaign.endsAt)}.`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button--ghost-dark';
      button.disabled = busy || !hasScope('finance:write');
      button.textContent = campaign.enabled ? 'Desativar' : 'Ativar';
      button.addEventListener(
        'click',
        () =>
          void perform(async () => {
            await api.setPromotionEnabled(
              getToken(),
              campaign.id,
              !campaign.enabled,
            );
            await reload();
            show('Status da campanha atualizado.', 'success');
          }),
      );
      card.append(title, detail, limits, button);
      list.append(card);
    }
  }
  async function reload() {
    if (destroyed) return;
    const result = await api.listPromotions(getToken());
    if (!destroyed) render(result.campaigns);
  }
  async function perform(action) {
    if (busy || destroyed) return;
    lock(true);
    show('');
    try {
      await action();
    } catch (error) {
      if (!destroyed) {
        show(error.message, 'danger');
        onError?.(error);
      }
    } finally {
      if (!destroyed) lock(false);
    }
  }
  listen(el('coupon-kind'), 'change', sync);
  for (const category of Object.keys(promotionCategories))
    listen(el(categoryControls[category]), 'change', sync);
  listen(el('coupons-refresh'), 'click', () => void perform(reload));
  listen(form, 'submit', (event) => {
    event.preventDefault();
    if (!hasScope('finance:write')) return;
    void perform(async () => {
      const values = {};
      for (const key of [
        'code',
        'name',
        'kind',
        'value',
        'percent',
        'cap',
        'maxRedemptions',
        'perPassengerLimit',
        'perDeviceLimit',
        'startsAt',
        'endsAt',
      ])
        values[key] = el(couponControls[key]).value;
      values.categories = Object.keys(promotionCategories).filter(
        (key) => el(categoryControls[key]).checked,
      );
      values.fares = Object.fromEntries(
        Object.keys(promotionCategories).map((key) => [
          key,
          el(fareControls[key]).value,
        ]),
      );
      await api.createPromotion(getToken(), promotionPayload(values));
      if (destroyed) return;
      form.reset();
      sync();
      show(
        'Campanha criada desativada. Revise os valores na lista e clique em Ativar.',
        'success',
      );
      await reload();
    });
  });
  lock(false);
  if (hasScope('finance:read')) void perform(reload);
  else
    show(
      'Sua conta precisa de permissão financeira de leitura para consultar campanhas.',
    );
  return {
    destroy() {
      destroyed = true;
      listeners.forEach((remove) => remove());
    },
  };
}

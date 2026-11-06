const categories = { moto: 'Mototáxi', car: 'Carro', delivery: 'Entrega', comfort_black: 'Comfort / 4x4', buggy: 'Buggy' };
export function defaultSearchPolicy(nearbyKm = 5) {
  return Object.fromEntries(Object.keys(categories).map(key => [key, {
    nearbyKm, expandedKm: Math.max(15, nearbyKm), allowExpansion: false,
    useCustomPickupFees: false, pickupFees: [],
  }]));
}
export function readSearchCategory({ nearbyKm, expandedKm, allowExpansion, useCustomPickupFees, pickupFees }) {
  if (pickupFees.length > 20 || pickupFees.some(t => String(t.amountReais).trim() === '' || String(t.upToKm).trim() === '')) {
    throw new Error('Preencha todas as faixas (máximo de 20). Use 0 explicitamente para uma faixa sem adicional.');
  }
  const policy = { nearbyKm: Number(nearbyKm), expandedKm: Number(expandedKm), allowExpansion,
    useCustomPickupFees, pickupFees: pickupFees.map(t => ({ upToKm: Number(t.upToKm), amountCents: Math.round(Number(t.amountReais) * 100) })) };
  if (!Number.isFinite(policy.nearbyKm) || policy.nearbyKm < 0.5 || policy.nearbyKm > 100 ||
      !Number.isFinite(policy.expandedKm) || policy.expandedKm < policy.nearbyKm || policy.expandedKm > 100) {
    throw new Error('Use distâncias de 0,5 a 100 km. O limite ampliado deve ser maior ou igual ao próximo.');
  }
  let previous = 0;
  for (const tier of policy.pickupFees) {
    if (!Number.isFinite(tier.upToKm) || tier.upToKm <= previous || tier.upToKm > 100 ||
        !Number.isSafeInteger(tier.amountCents) || tier.amountCents < 0 || tier.amountCents > 100000) {
      throw new Error('Preencha distâncias crescentes e valores entre R$ 0 e R$ 1.000.');
    }
    previous = tier.upToKm;
  }
  if (policy.useCustomPickupFees && previous < (policy.allowExpansion ? policy.expandedKm : policy.nearbyKm)) {
    throw new Error('As faixas devem cobrir toda a distância de busca.');
  }
  return policy;
}

export function createDriverSearchAdmin({ root, api, getToken, canWrite, onSaved }) {
  let policy = defaultSearchPolicy();
  let writable = false;
  const select = root.querySelector('[data-search-category]');
  const near = root.querySelector('[data-search-near]');
  const far = root.querySelector('[data-search-far]');
  const expand = root.querySelector('[data-search-expand]');
  const custom = root.querySelector('[data-search-custom]');
  const rows = root.querySelector('[data-search-tiers]');
  const message = root.querySelector('[data-search-message]');
  const save = root.querySelector('[data-search-save]');
  const add = root.querySelector('[data-search-add]');
  for (const [value, label] of Object.entries(categories)) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
  }
  function row(tier = {}) {
    const item = document.createElement('div'); item.className = 'driver-search-tier';
    const distanceLabel = document.createElement('label'); distanceLabel.textContent = 'Até (km)';
    const distance = document.createElement('input'); distance.type = 'number'; distance.min = '0.5';
    distance.max = '100'; distance.step = '0.5'; distance.value = tier.upToKm ?? ''; distance.dataset.distance = '';
    distance.disabled = !writable; distanceLabel.append(distance);
    const feeLabel = document.createElement('label'); feeLabel.textContent = 'Adicional total (R$)';
    const fee = document.createElement('input'); fee.type = 'number'; fee.min = '0'; fee.max = '1000'; fee.step = '0.01';
    fee.value = tier.amountCents == null ? '' : (tier.amountCents / 100).toFixed(2); fee.dataset.fee = '';
    fee.disabled = !writable; feeLabel.append(fee);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remover faixa';
    remove.disabled = !writable; remove.addEventListener('click', () => item.remove());
    item.append(distanceLabel, feeLabel, remove); rows.append(item);
  }
  function render() {
    const current = policy[select.value]; near.value = current.nearbyKm; far.value = current.expandedKm;
    expand.checked = current.allowExpansion; custom.checked = current.useCustomPickupFees;
    rows.replaceChildren(); current.pickupFees.forEach(row);
    for (const el of [near, far, expand, custom, save, add]) el.disabled = !writable;
  }
  select.addEventListener('change', () => { render(); message.textContent = 'As alterações não salvas da categoria anterior foram descartadas.'; });
  add.addEventListener('click', () => row());
  save.addEventListener('click', async () => {
    if (!writable || !getToken()) return;
    try {
      const selected = readSearchCategory({ nearbyKm: near.value, expandedKm: far.value,
        allowExpansion: expand.checked, useCustomPickupFees: custom.checked,
        pickupFees: [...rows.children].map(el => ({ upToKm: el.querySelector('[data-distance]').value,
          amountReais: el.querySelector('[data-fee]').value })) });
      const next = structuredClone(policy); next[select.value] = selected;
      save.disabled = true; message.textContent = 'Salvando…';
      const response = await api.updateDriverSearchPolicy(getToken(), next);
      policy = structuredClone(response.driverSearchPolicy ?? response.settings?.driverSearchPolicy ?? next);
      onSaved?.(response.settings ?? response);
      message.textContent = 'Categoria salva. O passageiro decide se amplia a busca; o preço aparece antes do pagamento.';
      render();
    } catch (error) { message.textContent = error.message || 'Não foi possível salvar.'; save.disabled = !writable; }
  });
  return { root, load(settings) {
    writable = settings != null && canWrite();
    policy = structuredClone(settings?.driverSearchPolicy ?? defaultSearchPolicy(settings?.driverSearchMaxDistanceKm ?? 5));
    render();
  } };
}

const BATCH_SIZE = 200;
const PAGE_SIZE = 75;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 10_000;

const AREAS = {
  prea: { latitude: -2.82017, longitude: -40.41467, radiusKm: 12 },
  jeri: { latitude: -2.7956, longitude: -40.5142, radiusKm: 10 },
  jijoca: { latitude: -2.8986, longitude: -40.4506, radiusKm: 12 },
};

function distanceKm(a, b) {
  const toRad = value => Number(value) * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function parseGeoUpload(input) {
  const items = Array.isArray(input) ? input : input?.places;
  if (!Array.isArray(items) || !items.length || items.length > MAX_RECORDS) {
    throw new Error('O arquivo precisa conter entre 1 e 10.000 lugares.');
  }
  const seen = new Set();
  return items.map((record, index) => {
    if (record == null || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`Registro ${index + 1}: estrutura inválida.`);
    }
    const source = record.source;
    if (!['osm', 'overture', 'manual'].includes(source)) {
      throw new Error(`Registro ${index + 1}: informe uma fonte válida (osm, overture ou manual).`);
    }
    const sourceId = String(record.sourceId ?? '');
    const name = String(record.name ?? '');
    const address = String(record.address ?? '');
    const category = String(record.category ?? '');
    const city = String(record.city ?? '');
    const latitude = record.latitude;
    const longitude = record.longitude;
    if (!/^[A-Za-z0-9_.:\/-]{1,160}$/.test(sourceId) ||
        name.trim().length < 2 || name.length > 160 ||
        address.length > 240 || category.length > 64 || city.length > 100 ||
        typeof latitude !== 'number' || !Number.isFinite(latitude) ||
        typeof longitude !== 'number' || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error(`Registro ${index + 1}: campos inválidos.`);
    }
    const key = `${source}:${sourceId}`;
    if (seen.has(key)) throw new Error(`Identificador duplicado: ${key}.`);
    seen.add(key);
    return { source, sourceId, name, address, category, city, latitude, longitude };
  });
}

export function filterGeoRegion(items, region) {
  if (region === 'all') return [...items];
  const area = AREAS[region];
  if (!area) throw new Error('Área desconhecida.');
  return items.filter(p => distanceKm(area, p) <= area.radiusKm);
}

const chunks = (array, size = BATCH_SIZE) => {
  const result = [];
  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size));
  }
  return result;
};

export function createGeoAdmin({ root, api, getToken, hasScope, onError }) {
  const el = id => root.querySelector('#' + id);
  let destroyed = false;
  let busy = false;
  let page = 0;
  let changes = [];
  let approved = new Set();
  let storagePolicyLoaded = false;
  let lastCleanupPreview = null;
  const canWrite = hasScope('pricing:write');
  const readOnlyMessage = 'Seu perfil pode consultar, mas não aprovar atualizações.';
  const message = (value, tone = 'neutral') => {
    if (destroyed) return;
    const field = el('geo-feedback');
    field.textContent = value;
    field.dataset.tone = tone;
    field.hidden = !value;
  };
  const setBusy = active => {
    busy = active;
    for (const id of ['geo-preview', 'geo-collect', 'geo-clear', 'geo-select-all',
      'geo-publish', 'geo-prev', 'geo-next', 'geo-refresh',
      'geo-storage-save','geo-storage-preview','geo-storage-clean']) {
      const btn = el(id);
      if (btn) btn.disabled = active;
    }
    if (!active) render();
  };
  const sayError = error => {
    if (destroyed) return;
    message(error?.message || 'Não foi possível concluir a operação.', 'danger');
    onError?.(error);
  };
  const short = num => Number(num || 0).toLocaleString('pt-BR');
  const setStats = async () => {
    const stats = await api.geoStats(getToken());
    if (destroyed) return;
    el('geo-hits').textContent = short(stats.localSearchHits);
    el('geo-details').textContent = short(stats.localDetails);
    el('geo-fallbacks').textContent = short(stats.googleFallbacks);
    const learning=stats.passengerLearning ?? {};
    el('geo-learned-selections').textContent = short(learning.selectedGooglePlaces);
    const regions = Array.isArray(learning.regions) ? learning.regions : [];
    el('geo-learned-places').textContent = short(regions.reduce((sum,item)=>sum+Number(item.totalImported||0),0));
    const status = regions.map(item =>
      `${({prea:'Preá',jeri:'Jeri',jijoca:'Jijoca'})[item.region] || item.region}: ` +
      `${({running:'Atualizando',succeeded:'Atualizada',failed:'Tentará novamente'})[item.status] || item.status}`
    ).join(' • ');
    el('geo-learned-status').textContent = stats.passengerLearningEnabled
      ? 'Aprendizado pelos passageiros ativado. ' + (status || 'Aguardando primeiras seleções.')
      : 'Aprendizado pelos passageiros desativado no Core.';
    el('geo-mode-status').textContent = stats.enabled
      ? 'Busca local ativada no Core' : 'Busca local desativada no Core';
    const storage=stats.storage ?? {};
    const policy=storage.policy ?? {};
    const used=Number(storage.usedBytes || 0);
    const mb=(used / 1048576).toLocaleString('pt-BR',{maximumFractionDigits:2});
    el('geo-storage-used').textContent=mb+' MB / '+short(policy.maxStorageMb)+' MB';
    el('geo-storage-count').textContent=short(storage.places);
    el('geo-storage-expired').textContent=short(storage.expiredPlaces);
    el('geo-storage-eligible').textContent=short(storage.cleanupEligible);
    el('geo-storage-popular').textContent=short(storage.popularDue);
    const level=storage.status || 'ok';
    el('geo-storage-state').textContent=({
      ok:'Dentro do limite',warning:'Atenção ao espaço',limit:'Limite alcançado',
    })[level] || level;
    el('geo-storage-alert').textContent=level==='ok'
      ? 'Espaço monitorado. Os registros antigos só são removidos após o prazo de segurança.'
      : level==='warning'
        ? 'Atenção: o GeoDB se aproxima do limite configurado. Revise os cadastros vencidos.'
        : 'Limite atingido: novos locais podem ficar bloqueados. Revise o espaço e as políticas.';
    el('geo-storage-schedule-status').textContent=stats.storageAutomationArmed
      ? 'Servidor permite manutenção programada quando marcada acima.'
      : 'Servidor não permite limpeza programada nesta versão. Apenas limpeza manual.';
    if(!storagePolicyLoaded && policy.maxStorageMb != null) {
      el('geo-storage-limit').value=String(policy.maxStorageMb);
      el('geo-storage-threshold').value=String(policy.alertPercent);
      el('geo-storage-retention').value=String(policy.retentionDays);
      el('geo-storage-auto').checked=policy.autoCleanupEnabled===true;
      storagePolicyLoaded=true;
    }
  };
  function storageValues() {
    const maxStorageMb=Number(el('geo-storage-limit').value);
    const alertPercent=Number(el('geo-storage-threshold').value);
    const retentionDays=Number(el('geo-storage-retention').value);
    if(!Number.isInteger(maxStorageMb) || maxStorageMb<16 || maxStorageMb>2048 ||
      !Number.isInteger(alertPercent) || alertPercent<50 || alertPercent>95 ||
      !Number.isInteger(retentionDays) || retentionDays<120 || retentionDays>365) {
      throw new Error('Informe limite de 16–2048 MB, alerta de 50–95% e retenção de 120–365 dias.');
    }
    return {maxStorageMb,alertPercent,retentionDays,
      autoCleanupEnabled:el('geo-storage-auto').checked};
  }
  async function saveStoragePolicy(){
    if(busy || !canWrite)return;
    setBusy(true);
    try {
      const updated=await api.geoStoragePolicy(getToken(),storageValues());
      if(!updated?.policy)throw new Error('O Core não confirmou as configurações.');
      message('Política de armazenamento salva. O Core respeitará os novos limites.','success');
      await setStats();
    }catch(error){sayError(error);}
    finally { if(!destroyed)setBusy(false); }
  }
  async function previewStorageCleanup(){
    if(busy)return;
    setBusy(true);
    try{
      lastCleanupPreview=await api.geoStorageCleanup(getToken(),true);
      message(lastCleanupPreview.skipped==='busy'
        ? 'Uma importação está em andamento; tente novamente após concluir.'
        : `Limpeza simulada: ${short(lastCleanupPreview.eligible)} registros elegíveis. Até 100 seriam removidos por execução. Nenhum dado foi apagado.`,
      lastCleanupPreview.skipped?'neutral':'success');
    }catch(error){sayError(error);}
    finally {if(!destroyed)setBusy(false);}
  }
  async function cleanStorage(){
    if(busy || !canWrite)return;
    if(lastCleanupPreview==null) {
      message('Use Simular limpeza antes de confirmar.','danger');
      return;
    }
    if(lastCleanupPreview.eligible<1){
      message('Não há registros elegíveis para limpeza.','neutral');
      return;
    }
    if(!window.confirm(`Excluir até 100 dos ${lastCleanupPreview.eligible} lugares vencidos e sem uso recente? Locais manuais serão preservados.`))return;
    setBusy(true);
    try{
      const result=await api.geoStorageCleanup(getToken(),false);
      lastCleanupPreview=null;
      message(`${short(result.removed)} registros antigos removidos nesta operação.`,'success');
      await setStats();
    }catch(error){sayError(error);}
    finally{if(!destroyed)setBusy(false);}
  }
  function render() {
    if (destroyed) return;
    const all = changes.length;
    const counts = { new: 0, changed: 0, unchanged: 0 };
    for (const result of changes) counts[result.kind]++;
    el('geo-summary').textContent = all
      ? `${short(all)} registros comparados: ${short(counts.new)} novos, ${short(counts.changed)} alterados e ${short(counts.unchanged)} iguais. ${short(approved.size)} selecionados.`
      : 'Escolha um arquivo e clique em Analisar e comparar.';
    const body = el('geo-table-body');
    body.replaceChildren();
    const view = changes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    if (!view.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4; td.textContent = 'Sem registros para revisar.';
      tr.append(td); body.append(tr);
    }
    for (let i = 0; i < view.length; i++) {
      const item = view[i];
      const index = page * PAGE_SIZE + i;
      const tr = document.createElement('tr');
      const tdCheck = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = approved.has(index);
      checkbox.disabled = busy || !canWrite || item.kind === 'unchanged';
      checkbox.setAttribute('aria-label', `Aprovar ${item.place.name}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) approved.add(index);
        else approved.delete(index);
        render();
      });
      tdCheck.append(checkbox);
      const tdName = document.createElement('td');
      const name = document.createElement('strong');
      name.textContent = item.place.name;
      const address = document.createElement('small');
      address.textContent = item.place.address || item.place.city;
      tdName.append(name, address);
      const tdSource = document.createElement('td');
      tdSource.textContent = item.place.source;
      const tdKind = document.createElement('td');
      tdKind.textContent = ({ new: 'Novo', changed: 'Alterado',
        unchanged: 'Igual' })[item.kind] || item.kind;
      tr.append(tdCheck, tdName, tdSource, tdKind); body.append(tr);
    }
    el('geo-pagination-label').textContent = all
      ? `Mostrando ${short(page * PAGE_SIZE + 1)}–${short(Math.min(all,(page+1)*PAGE_SIZE))} de ${short(all)}`
      : '0 resultados';
    el('geo-prev').disabled = busy || page === 0;
    el('geo-next').disabled = busy || (page + 1) * PAGE_SIZE >= all;
    el('geo-select-all').disabled = busy || !canWrite || !changes.length;
    el('geo-publish').disabled = busy || !canWrite || approved.size === 0;
    el('geo-collect').disabled = busy || !canWrite || el('geo-region').value === 'all';
  }
  const clear = () => {
    changes = []; approved = new Set(); page = 0;
    el('geo-upload').value = '';
    message('');
    render();
  };
  async function comparePlaces(places) {
    if (!places.length) throw new Error('Nenhum registro pertence à área escolhida.');
    const result = [];
    let completed = 0;
    for (const part of chunks(places)) {
      const response = await api.geoPreview(getToken(), part);
      if (destroyed) return;
      if (!Array.isArray(response?.changes) || response.changes.length !== part.length) {
        throw new Error('O Core retornou uma comparação incompleta.');
      }
      result.push(...response.changes);
      completed += part.length;
      message(`Comparando ${short(completed)} de ${short(places.length)} registros…`);
    }
    changes = result;
    approved = new Set(result.flatMap((item, index) =>
      item.kind === 'unchanged' ? [] : [index]));
    page = 0;
    message(`Análise concluída. Revise os ${short(approved.size)} registros selecionados antes de publicar.`, 'success');
  }
  async function preview() {
    if (busy) return;
    if (!hasScope('pricing:read')) { message('Sem permissão para consultar dados geográficos.','danger'); return; }
    const file = el('geo-upload').files?.[0];
    if (!file) { message('Selecione um arquivo JSON para analisar.', 'danger'); return; }
    if (file.size > MAX_JSON_BYTES) {
      message('O arquivo excede o limite de 5 MB.', 'danger'); return;
    }
    setBusy(true); changes = []; approved = new Set(); page = 0;
    try {
      const raw = JSON.parse(await file.text());
      const all = parseGeoUpload(raw);
      const places = filterGeoRegion(all, el('geo-region').value);
      await comparePlaces(places);
    } catch (error) { changes = []; approved.clear(); sayError(error); }
    finally { if (!destroyed) setBusy(false); }
  }
  async function collect() {
    if (busy) return;
    if (!canWrite) { message(readOnlyMessage,'danger'); return; }
    const region = el('geo-region').value;
    if (region === 'all') {
      message('Escolha Preá, Jericoacoara ou Jijoca antes de coletar.', 'danger');
      return;
    }
    setBusy(true); changes = []; approved = new Set(); page = 0;
    try {
      message('Consultando os dados abertos da localidade selecionada…');
      const collection = await api.geoCollect(getToken(), region);
      if (destroyed) return;
      if (collection?.provider !== 'osm' || collection?.region !== region) {
        throw new Error('A fonte retornou uma área diferente da selecionada.');
      }
      const places = filterGeoRegion(parseGeoUpload(collection.places), region);
      await comparePlaces(places);
      if (collection.truncated) {
        message('Prévia parcial: a fonte atingiu o limite de coleta. Revise antes de publicar.', 'neutral');
      }
    } catch (error) { changes = []; approved.clear(); sayError(error); }
    finally { if (!destroyed) setBusy(false); }
  }
  async function publish() {
    if (busy || !canWrite || approved.size === 0) return;
    const selected = [...approved].sort((a,b)=>a-b).map(index => changes[index].place);
    if (!window.confirm(`Confirmar a publicação de ${selected.length} destinos no catálogo geográfico? Isso não altera tarifas.`)) return;
    setBusy(true);
    const totals = { added: 0, changed: 0, unchanged: 0 };
    let completed = 0;
    try {
      for (const part of chunks(selected)) {
        const result = await api.geoImport(getToken(), part);
        if (destroyed) return;
        for (const key of Object.keys(totals)) totals[key] += Number(result?.summary?.[key] || 0);
        completed += part.length;
        message(`Publicando ${short(completed)} de ${short(selected.length)} registros…`);
      }
      const confirmed = new Set(approved);
      changes = changes.map((change, index) => confirmed.has(index)
        ? { ...change, kind: 'unchanged' } : change);
      approved.clear();
      message(`Atualização concluída: ${short(totals.added)} novos, ${short(totals.changed)} modificados e ${short(totals.unchanged)} já existentes.`, 'success');
      await setStats();
    } catch (error) {
      // Partial batches must remain visible; retry uses the same stable source ID.
      message(`Importação interrompida após ${short(completed)} de ${short(selected.length)} registros. Repita a análise antes de tentar novamente. ${error?.message || ''}`, 'danger');
      onError?.(error);
      approved.clear(); changes = [];
    } finally { if (!destroyed) setBusy(false); }
  }
  const listeners = [];
  function listen(id, event, handler) {
    const target = el(id); target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  }
  listen('geo-storage-policy-form','submit',event=>{event.preventDefault();void saveStoragePolicy();});
  listen('geo-storage-preview','click',()=>{void previewStorageCleanup();});
  listen('geo-storage-clean','click',()=>{void cleanStorage();});
  listen('geo-preview','click',() => { void preview(); });
  listen('geo-collect','click',() => { void collect(); });
  listen('geo-clear','click',clear);
  listen('geo-refresh','click',() => { if (!busy) void setStats().catch(sayError); });
  listen('geo-prev','click',() => { page = Math.max(0,page-1); render(); });
  listen('geo-next','click',() => { page += 1; render(); });
  listen('geo-select-all','click',() => {
    approved = new Set(changes.flatMap((item,index) => item.kind === 'unchanged' ? [] : [index]));
    render();
  });
  listen('geo-publish','click',() => { void publish(); });
  listen('geo-region','change',() => {
    changes = []; approved.clear(); page = 0; render();
    message('A área mudou. Clique novamente em Analisar e comparar para revisar o arquivo.');
  });
  el('geo-publish').title = canWrite ? '' : readOnlyMessage;
  if(!canWrite) {
    for(const id of ['geo-storage-limit','geo-storage-threshold','geo-storage-retention',
      'geo-storage-auto','geo-storage-save','geo-storage-clean'])el(id).disabled=true;
  }
  render();
  void setStats().catch(sayError);
  return { destroy() { destroyed = true; listeners.forEach(off => off()); changes = []; approved.clear(); } };
}

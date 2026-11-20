const labels = {
  portrait: 'Foto do rosto',
  vehicle_front: 'Frente do veículo',
  vehicle_rear: 'Traseira e placa',
  vehicle_left: 'Lateral esquerda',
  vehicle_right: 'Lateral direita',
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, action, className = 'button button--ghost-dark') {
  const node = element('button', label, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function photoLabel(photo) {
  return labels[photo.type] ?? 'Foto do cadastro';
}

export function createDriverPhotoReview({ api, token, canWrite, target }) {
  let queueVersion = 0;
  let imageVersion = 0;
  let objectUrl = null;
  let selected = null;
  let offset = 0;
  let query = '';
  let active = true;

  const root = element('div', '', 'driver-photo-workspace');
  const list = element('div', '', 'driver-photo-groups');
  const preview = element('section', '', 'driver-photo-preview');
  preview.setAttribute('aria-label', 'Conferência da foto');
  const message = element('p', '', 'driver-photo-feedback');
  message.setAttribute('role', 'status');
  const pager = element('nav', '', 'driver-photo-pager');
  pager.setAttribute('aria-label', 'Páginas da fila de fotos');
  const policy = element('details', '', 'driver-photo-settings');
  const settings = element('div', '', 'driver-photo-settings__body');
  policy.append(element('summary', 'Configurações da exigência'), settings);

  function queueError(error) {
    if (error.status === 401) return 'Sua sessão expirou. Entre no ADM para consultar as fotos.';
    if (error.status === 403) return 'Sua conta precisa de permissão para consultar documentos de motoristas.';
    if (error.status === 404) return 'A análise de fotos está indisponível.';
    return 'Não foi possível carregar as fotos. Use Atualizar fila para tentar novamente.';
  }

  function feedback(text = '', tone = 'neutral') {
    message.textContent = text;
    message.dataset.tone = tone;
    message.hidden = !text;
  }

  async function loadPolicy() {
    try {
      const result = await api.driverVerificationPolicy(token);
      if (!active || !target.isConnected) return;
      const toggle = element('input');
      toggle.type = 'checkbox';
      toggle.checked = result.required;
      toggle.disabled = !canWrite();
      const label = element('label', 'Exigir cinco fotos aprovadas para novas corridas');
      label.prepend(toggle);
      const save = button('Salvar configuração', async () => {
        toggle.disabled = true;
        save.disabled = true;
        try {
          await api.driverVerificationPolicy(token, { required: toggle.checked });
          if (active) {
            feedback('Configuração salva.', 'success');
            await loadPolicy();
          }
        } catch (error) {
          if (active) {
            feedback(error.message, 'danger');
            toggle.disabled = !canWrite();
            save.disabled = !canWrite();
          }
        }
      });
      const disk = result.disk;
      const space = disk ? `Espaço livre para fotos: ${disk.freeMiB} MiB.` : 'Espaço para fotos indisponível.';
      const warning = disk?.level === 'critical' ? ' Novos envios estão suspensos por falta de espaço.'
        : disk?.level === 'low' ? ' O espaço livre está baixo.' : '';
      const controls = element('div', '', 'driver-photo-actions');
      controls.append(label);
      if (canWrite()) controls.append(save);
      settings.replaceChildren(controls, element('p', space + warning, 'muted-copy'));
    } catch (error) {
      if (active) settings.textContent = queueError(error);
    }
  }

  function releaseImage() {
    imageVersion++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function resetPreview(text = 'Selecione uma foto na fila para conferir.') {
    releaseImage();
    selected = null;
    preview.replaceChildren(element('p', text, 'driver-photo-placeholder'));
  }

  async function open(photo, control) {
    releaseImage();
    selected?.removeAttribute('aria-current');
    selected = control;
    control.setAttribute('aria-current', 'true');
    const version = imageVersion;
    feedback();
    const heading = element('div', '', 'driver-photo-preview__header');
    heading.append(element('h3', photoLabel(photo)),
      element('p', [photo.driverName, photo.plate].filter(Boolean).join(' · '), 'muted-copy'));
    const stage = element('div', '', 'driver-photo-stage');
    stage.append(element('p', 'Carregando foto…'));
    preview.replaceChildren(heading, stage);
    if (window.matchMedia('(max-width: 850px)').matches) {
      preview.scrollIntoView({ block: 'nearest' });
    }
    try {
      const response = await api.driverVerificationImage(token, photo.id, true);
      if (version !== imageVersion || !active || !target.isConnected) return;
      objectUrl = URL.createObjectURL(new Blob([response.bytes], { type: 'image/jpeg' }));
      const img = element('img');
      img.src = objectUrl;
      img.alt = photoLabel(photo);
      const enlarge = button('Ampliar imagem', () => {
        const zoomed = stage.classList.toggle('driver-photo-stage--zoomed');
        enlarge.textContent = zoomed ? 'Ajustar à tela' : 'Ampliar imagem';
        enlarge.setAttribute('aria-pressed', String(zoomed));
      });
      enlarge.setAttribute('aria-pressed', 'false');
      stage.replaceChildren(img);
      const toolbar = element('div', '', 'driver-photo-actions driver-photo-preview__tools');
      toolbar.append(enlarge);
      preview.append(toolbar);
      if (canWrite()) renderDecision(photo, version);
    } catch (error) {
      if (version === imageVersion && active) {
        stage.replaceChildren(element('p', error.message), button('Tentar novamente', () => open(photo, control)));
      }
    }
  }

  function renderDecision(photo, version) {
    const form = element('form', '', 'driver-photo-decision');
    const actions = element('div', '', 'driver-photo-actions');
    const correction = element('div', '', 'driver-photo-correction');
    correction.hidden = true;
    const reason = element('textarea');
    reason.maxLength = 1000;
    reason.rows = 3;
    const label = element('label', 'Motivo para solicitar nova foto', 'field');
    label.append(reason);

    async function save(decision) {
      if (decision === 'rejected' && !reason.value.trim()) {
        feedback('Informe o motivo para solicitar uma nova foto.', 'danger');
        reason.focus();
        return;
      }
      for (const control of form.elements) control.disabled = true;
      try {
        await api.reviewDriverVerificationPhoto(token, photo.id, {
          decision, reason: decision === 'rejected' ? reason.value.trim() : '',
        });
        if (version !== imageVersion || !active) return;
        await load(offset, decision === 'approved' ? 'Foto aprovada.' : 'Reenvio solicitado.');
      } catch (error) {
        if (version === imageVersion && active) {
          feedback(error.message, 'danger');
          for (const control of form.elements) control.disabled = false;
        }
      }
    }

    const confirm = element('button', 'Confirmar reenvio', 'button button--primary');
    confirm.type = 'submit';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!correction.hidden) void save('rejected');
    });
    const approve = button('Aprovar foto', () => save('approved'), 'button button--primary');
    const reject = button('Solicitar reenvio', () => {
      correction.hidden = false;
      actions.hidden = true;
      reason.focus();
    });
    correction.append(label, confirm, button('Voltar', () => {
      correction.hidden = true;
      actions.hidden = false;
      reject.focus();
    }));
    actions.append(reject, approve);
    form.append(actions, correction);
    preview.append(form);
  }

  function renderQueue(photos) {
    const groups = new Map();
    for (const photo of photos) {
      const key = photo.driverId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(photo);
    }
    for (const photosForDriver of groups.values()) {
      const [first] = photosForDriver;
      const group = element('section', '', 'driver-photo-group');
      const identity = element('div', '', 'driver-photo-group__identity');
      identity.append(element('h3', first.driverName || 'Motorista'),
        element('p', first.plate, 'muted-copy'));
      group.append(identity);
      for (const photo of photosForDriver) {
        const control = button(photoLabel(photo), () => open(photo, control), 'driver-photo-option');
        control.append(element('span', 'Ver foto'));
        group.append(control);
      }
      list.append(group);
    }
  }

  async function load(next = 0, confirmation = '') {
    const version = ++queueVersion;
    resetPreview();
    list.replaceChildren();
    pager.replaceChildren();
    feedback('Carregando fila…');
    try {
      const page = await api.driverVerificationPhotos(token, next, query);
      if (version !== queueVersion || !active || !target.isConnected) return;
      if (!page.photos.length && next > 0) {
        await load(Math.max(0, next - 20), confirmation);
        return;
      }
      offset = next;
      if (!page.photos.length) {
        resetPreview(query ? 'Nenhuma foto encontrada para esta busca.' : 'Nenhuma foto aguardando análise.');
      }
      renderQueue(page.photos);
      feedback(confirmation, confirmation ? 'success' : 'neutral');
      if (offset > 0) pager.append(button('Anterior', () => load(offset - 20)));
      if (page.hasMore) pager.append(button('Próxima', () => load(offset + 20)));
    } catch (error) {
      if (version === queueVersion && active) feedback(queueError(error), 'danger');
    }
  }

  const search = element('form', '', 'driver-photo-search');
  const field = element('input');
  field.type = 'search';
  field.maxLength = 80;
  field.placeholder = 'Nome ou placa';
  const label = element('label', 'Buscar por motorista ou placa', 'field');
  label.append(field);
  const submit = element('button', 'Buscar', 'button button--ghost-dark');
  search.append(label, submit, button('Atualizar fila', () => load(offset)));
  search.addEventListener('submit', (event) => {
    event.preventDefault();
    query = field.value.trim();
    void load();
  });
  const layout = element('div', '', 'driver-photo-layout');
  const queue = element('div', '', 'driver-photo-queue');
  queue.append(list, pager);
  layout.append(queue, preview);
  root.append(search, message, layout, policy);
  target.replaceChildren(root);
  feedback();
  void loadPolicy();
  return { load, destroy() { active = false; releaseImage(); target.replaceChildren(); } };
}

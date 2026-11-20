const labels = {
  portrait: 'Rosto',
  vehicle_front: 'Frente do veículo',
  vehicle_rear: 'Traseira do veículo',
  vehicle_left: 'Lateral esquerda',
  vehicle_right: 'Lateral direita',
};

function element(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

function button(label, action) {
  const node = element('button', label);
  node.type = 'button';
  node.className = 'secondary-button';
  node.addEventListener('click', action);
  return node;
}

export function createDriverPhotoReview({ api, token, canWrite, target }) {
  let currentRequest = 0;
  let objectUrl = null;
  let offset = 0;
  let query = '';
  const message = element('p');
  message.setAttribute('role', 'status');
  const list = element('div');
  const preview = element('div');
  const policy = element('div');
  let active = true;

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
      const save = button('Salvar exigência', async () => {
        toggle.disabled = true;
        save.disabled = true;
        try {
          await api.driverVerificationPolicy(token, { required: toggle.checked });
          if (!active) return;
          message.textContent = 'Exigência de fotos salva.';
          await loadPolicy();
        } catch (error) {
          if (!active) return;
          message.textContent = error.message;
          toggle.disabled = !canWrite();
          save.disabled = !canWrite();
        }
      });
      const disk = result.disk;
      const capacity = disk ? `Espaço livre no volume das fotos: ${disk.freeMiB} MiB.` : 'Espaço no volume indisponível.';
      const warning = disk?.level === 'critical' ? ' Espaço crítico. Novos envios estão suspensos.'
        : disk?.level === 'low' ? ' Espaço livre baixo.' : '';
      policy.replaceChildren(element('h3', 'Exigência das fotos'), element('p', capacity + warning), label);
      if (canWrite()) policy.append(save);
    } catch (error) {
      if (active) policy.textContent = error.message;
    }
  }

  function clearPreview() {
    currentRequest++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    preview.replaceChildren();
  }

  async function open(photo, fullSize) {
    clearPreview();
    const request = currentRequest;
    try {
      const image = await api.driverVerificationImage(token, photo.id, fullSize);
      if (request !== currentRequest || !target.isConnected) return;
      objectUrl = URL.createObjectURL(new Blob([image.bytes], { type: 'image/jpeg' }));
      const img = element('img');
      img.src = objectUrl;
      img.alt = labels[photo.type] ?? 'Foto do cadastro';
      img.width = fullSize ? 520 : 256;
      const form = element('form');
      const reason = element('textarea');
      reason.maxLength = 1000;
      const label = element('label', 'Motivo da reprovação');
      label.append(reason);
      const save = (decision) => async () => {
        if (decision === 'rejected' && !reason.value.trim()) {
          message.textContent = 'Informe o motivo da reprovação.';
          reason.focus();
          return;
        }
        for (const control of form.elements) control.disabled = true;
        try {
          await api.reviewDriverVerificationPhoto(token, photo.id, { decision, reason: reason.value.trim() });
          if (request === currentRequest) await load(offset);
        } catch (error) {
          if (request === currentRequest) {
            message.textContent = error.message;
            for (const control of form.elements) control.disabled = false;
          }
        }
      };
      if (fullSize && canWrite()) {
        const approve = button('Aprovar foto', save('approved'));
        const reject = button('Reprovar foto', save('rejected'));
        form.append(label, approve, reject);
      }
      preview.replaceChildren(img, button(fullSize ? 'Fechar foto' : 'Abrir foto em tamanho maior',
        () => fullSize ? clearPreview() : open(photo, true)), form);
    } catch (error) {
      if (request === currentRequest) message.textContent = error.message;
    }
  }

  async function load(next = 0) {
    clearPreview();
    const request = currentRequest;
    message.textContent = 'Carregando fotos…';
    try {
      const page = await api.driverVerificationPhotos(token, next, query);
      if (request !== currentRequest || !target.isConnected) return;
      offset = next;
      if (!page.photos.length && next > 0) {
        await load(Math.max(0, next - 20));
        return;
      }
      list.replaceChildren();
      message.textContent = page.photos.length ? '' : 'Nenhuma foto aguardando análise.';
      for (const photo of page.photos) {
        const row = element('p');
        row.append(element('span', [photo.driverName, photo.plate, labels[photo.type]].filter(Boolean).join(' · ')),
          button('Ver foto', () => open(photo, false)));
        list.append(row);
      }
      if (offset > 0) list.append(button('Anterior', () => load(Math.max(0, offset - 20))));
      if (page.hasMore) list.append(button('Próxima', () => load(offset + 20)));
    } catch (error) {
      if (request === currentRequest) message.textContent = error.message;
    }
  }

  const search = element('form');
  const field = element('input');
  field.type = 'search';
  field.maxLength = 80;
  const label = element('label', 'Buscar por motorista ou placa');
  label.append(field);
  const submit = element('button', 'Buscar');
  search.append(label, submit);
  search.addEventListener('submit', (event) => {
    event.preventDefault();
    query = field.value.trim();
    void load();
  });
  target.replaceChildren(policy, search, message, preview, list);
  void loadPolicy();
  return { load, destroy() { active = false; clearPreview(); target.replaceChildren(); } };
}

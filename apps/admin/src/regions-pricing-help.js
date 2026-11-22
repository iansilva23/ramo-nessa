import {pricingGuide, searchPricingGuide} from './help/regions-pricing-guide.js';

function el(tag, text, className) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (className) n.className = className;
  return n;
}
export function pricingHelpButton(topic, label = 'Como funciona?') {
  const compact = label.startsWith('Ajuda: ');
  const b = el('button', compact ? '?' : label, compact ? 'rp-help-icon' : 'rp-help-link');
  b.type = 'button'; b.dataset.pricingHelp = topic;
  b.setAttribute('aria-haspopup', 'dialog');
  if (compact) { b.setAttribute('aria-label', label); b.title = label; }
  return b;
}

// One manual per mounted workspace. Nothing is stored, submitted or fetched.
// Native modal focus containment also works above a still-open editor.
export function createPricingHelp({root, ownsElement = n => root.contains(n)}) {
  const abort = new AbortController();
  let dialog = null, opener = null, destroyed = false;
  function close() { dialog?.close(); }
  function open(topic = 'start', trigger = document.activeElement) {
    if (destroyed) return;
    if (dialog) { dialog.close(); }
    opener = trigger;
    const d = el('dialog', null, 'rp-dialog rp-help-dialog'); dialog = d;
    const titleId = 'rp-help-' + crypto.randomUUID();
    d.setAttribute('aria-labelledby', titleId);
    const header = el('header', null, 'rp-dialog-header');
    const heading = el('div');
    heading.append(el('span', 'MANUAL DO ADMINISTRADOR', 'rp-eyebrow'));
    const title = el('h2', 'Ajuda e tutoriais'); title.id = titleId;
    heading.append(title, el('p', 'Regiões e preços · Explicações completas, campo por campo.'));
    const dismiss = el('button', 'Voltar ao painel', 'button button--ghost'); dismiss.type = 'button';
    dismiss.addEventListener('click', close); header.append(heading, dismiss);
    const searchArea = el('div', null, 'rp-help-search');
    const searchId = titleId + '-search', label = el('label', 'O que você precisa entender?'); label.htmlFor = searchId;
    const searchRow = el('div', null, 'rp-help-search-row');
    const input = el('input'); input.type = 'search'; input.id = searchId; input.maxLength = 160;
    input.placeholder = 'Ex.: raio, preço por km, excluir, código MFA'; input.autocomplete = 'off';
    const clear = el('button', 'Limpar busca', 'button button--ghost'); clear.type = 'button'; clear.hidden = true;
    const count = el('p', null, 'rp-help-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    searchRow.append(input, clear); searchArea.append(label, searchRow, count);
    const layout = el('div', null, 'rp-help-layout');
    const nav = el('nav', null, 'rp-help-index'); nav.setAttribute('aria-label', 'Capítulos do manual');
    const article = el('article', null, 'rp-help-article');
    const articleId = titleId + '-article'; article.id = articleId; article.tabIndex = -1;
    layout.append(nav, article); d.append(header, searchArea, layout);
    let selected = pricingGuide.find(c => c.id === topic) ?? pricingGuide[0];
    function display(item, focus = false) {
      selected = item;
      const h = el('h3', item.title); h.id = titleId + '-chapter';
      article.setAttribute('aria-labelledby', h.id);
      article.replaceChildren(el('span', item.group, 'rp-eyebrow'), h, el('p', item.summary, 'rp-help-lead'));
      for (const s of item.sections) {
        const block = el('section'); block.append(el('h4', s.title));
        s.paragraphs.forEach(p => block.append(el('p', p)));
        if (s.rows.length) {
          const fields = el('dl', null, 'rp-help-definitions');
          for (const [name, explanation] of s.rows) {
            const row = el('div'); row.append(el('dt', name), el('dd', explanation)); fields.append(row);
          }
          block.append(fields);
        }
        if (s.steps.length) { const list = el('ol'); s.steps.forEach(step => list.append(el('li', step))); block.append(list); }
        article.append(block);
      }
      const related = el('div', null, 'rp-help-related'); related.append(el('h4', 'Continue aprendendo'));
      item.related.forEach(id => {
        const target = pricingGuide.find(c => c.id === id);
        if (!target) return;
        const b = el('button', target.title, 'rp-help-link'); b.type = 'button';
        b.addEventListener('click', () => { input.value = ''; renderIndex(); display(target, true); }); related.append(b);
      });
      article.append(related);
      nav.querySelectorAll('button').forEach(b => {
        if (b.dataset.chapter === item.id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      });
      article.scrollTop = 0;
      if (focus) { article.focus({preventScroll: true}); article.scrollIntoView({block: 'nearest'}); }
    }
    function renderIndex() {
      const matches = searchPricingGuide(input.value); nav.replaceChildren();
      clear.hidden = !input.value;
      count.textContent = matches.length + (matches.length === 1 ? ' capítulo encontrado' : ' capítulos encontrados');
      let group = '';
      for (const item of matches) {
        if (item.group !== group) { group = item.group; nav.append(el('h3', group)); }
        const b = el('button', null, 'rp-help-chapter'); b.type = 'button'; b.dataset.chapter = item.id;
        b.setAttribute('aria-controls', articleId);
        b.append(el('strong', item.title), el('span', item.summary));
        if (item.id === selected.id) b.setAttribute('aria-current', 'page');
        b.addEventListener('click', () => display(item, true)); nav.append(b);
      }
      if (!matches.length) {
        nav.append(el('p', 'Nenhum capítulo encontrado. Tente uma palavra mais simples ou limpe a busca.', 'rp-help-empty'));
        article.replaceChildren(el('h3', 'Vamos encontrar sua dúvida'), el('p', 'Tente “raio”, “tarifa”, “noite” ou “MFA”. A busca procura todas as palavras digitadas no mesmo capítulo.'));
      } else display(matches.find(item => item.id === selected.id) ?? matches[0]);
    }
    input.addEventListener('input', renderIndex);
    clear.addEventListener('click', () => { input.value = ''; renderIndex(); display(pricingGuide[0]); input.focus(); });
    d.addEventListener('close', () => {
      d.remove();
      if (dialog === d) { dialog = null; const target = opener; opener = null; if (!destroyed && target?.isConnected) target.focus({preventScroll: true}); }
    }, {once: true});
    document.body.append(d); display(selected); renderIndex(); d.showModal(); input.focus();
  }
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest('[data-pricing-help]');
    if (!trigger || !ownsElement(trigger)) return;
    event.preventDefault(); open(trigger.dataset.pricingHelp, trigger);
  }, {signal: abort.signal});
  return {open, destroy() { destroyed = true; abort.abort(); close(); dialog?.remove(); dialog = null; opener = null; }};
}

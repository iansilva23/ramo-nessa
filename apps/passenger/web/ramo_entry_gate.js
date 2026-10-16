/* Installed web app entry surface. No permissions, authentication or synthetic clicks. */
(() => {
  'use strict';
  const displayMode = window.matchMedia('(display-mode: standalone)');
  if (navigator.standalone !== true && !displayMode.matches) return;
  if (document.getElementById('ramo-entry-gate')) return;

  const gate = document.createElement('button');
  gate.id = 'ramo-entry-gate';
  gate.type = 'button';
  gate.setAttribute('aria-label', 'Entrar no Ramo Nessa. Deslize para a direita ou esquerda em qualquer parte da tela. Com leitor de tela, ative este controle.');
  gate.innerHTML = `
    <span class="ramo-gate-brand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>RAMO NESSA</span>
    <span class="ramo-gate-welcome">
      <span class="ramo-gate-glass" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg></span>
      <span class="ramo-gate-title">Pronto para ir?</span>
      <span class="ramo-gate-subtitle">Seu próximo destino<br>está a um deslize.</span>
    </span>
    <span class="ramo-gate-hint" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m14 6-6 6 6 6"/></svg><span>Deslize para entrar</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m10 6 6 6-6 6"/></svg></span>
    <span class="ramo-gate-anywhere" aria-hidden="true">Em qualquer lugar da tela</span>`;

  let locked = false;
  let hiddenSinceEntry = false;
  let gesture = null;
  let hideTimer;
  let generation = 0;
  const madeInert = new Set();

  function emit(state, reason) {
    window.dispatchEvent(new CustomEvent('ramo-entry-gate-change', { detail: { state, reason } }));
  }

  function protectChildren() {
    for (const node of document.body.children) {
      if (node === gate || !(node instanceof HTMLElement) || ['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)) continue;
      if (!node.inert) { node.inert = true; madeInert.add(node); }
    }
  }

  const observer = new MutationObserver(() => { if (locked) protectChildren(); });
  function resetGesture() {
    gesture = null;
    gate.classList.remove('ramo-gate-dragging');
    gate.style.removeProperty('--ramo-gate-drag');
  }

  function show(reason) {
    if (locked) {
      if (gate.classList.contains('ramo-gate-leaving')) {
        generation += 1;
        clearTimeout(hideTimer);
        gate.disabled = false;
        gate.classList.remove('ramo-gate-leaving');
      }
      resetGesture();
      return;
    }
    generation += 1;
    clearTimeout(hideTimer);
    locked = true;
    resetGesture();
    gate.hidden = false;
    gate.disabled = false;
    gate.classList.remove('ramo-gate-leaving');
    protectChildren();
    observer.observe(document.body, { childList: true });
    emit('locked', reason);
  }

  function unlock(reason) {
    if (!locked) return;
    const current = ++generation;
    resetGesture();
    gate.disabled = true;
    gate.classList.add('ramo-gate-leaving');
    // Keep the underlying controls inert through pointerup and the fade.
    hideTimer = setTimeout(() => {
      if (current !== generation) return;
      locked = false;
      observer.disconnect();
      gate.hidden = true;
      gate.disabled = false;
      if (document.activeElement === gate) gate.blur();
      for (const node of madeInert) node.inert = false;
      madeInert.clear();
      emit('unlocked', reason);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 360);
  }

  gate.addEventListener('pointerdown', event => {
    event.stopPropagation();
    if (!locked || gate.disabled) return;
    if (!event.isPrimary) { resetGesture(); return; }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    gate.setPointerCapture(event.pointerId);
    gate.classList.add('ramo-gate-dragging');
  });
  gate.addEventListener('pointermove', event => {
    event.stopPropagation();
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    gate.style.setProperty('--ramo-gate-drag', Math.max(-72, Math.min(72, dx * .32)) + 'px');
  });
  gate.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    const threshold = Math.min(90, gate.getBoundingClientRect().width * .25);
    const accepted = Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.25;
    resetGesture();
    if (gate.hasPointerCapture(event.pointerId)) gate.releasePointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    if (accepted) unlock('swipe');
  });
  gate.addEventListener('pointercancel', resetGesture);
  gate.addEventListener('lostpointercapture', resetGesture);
  for (const name of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    gate.addEventListener(name, event => event.stopPropagation(), { passive: true });
  }
  gate.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail === 0) unlock('accessible-activation');
  });

  // Focus/blur are deliberately ignored: an OS permission dialog is not a new entry.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenSinceEntry = true;
      resetGesture();
      // Cancel an in-flight unlock before the document is suspended.
      if (gate.classList.contains('ramo-gate-leaving')) {
        generation += 1;
        clearTimeout(hideTimer);
        gate.disabled = false;
        gate.classList.remove('ramo-gate-leaving');
      }
    } else if (hiddenSinceEntry) {
      hiddenSinceEntry = false;
      show('foreground');
    }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) show('page-restored'); });
  window.addEventListener('resize', resetGesture, { passive: true });
  window.addEventListener('orientationchange', resetGesture, { passive: true });
  document.body.append(gate);
  show('launch');
})();

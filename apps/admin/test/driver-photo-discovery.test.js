import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('the Motoristas photo panel is visible before any queue request', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function discoverDriverPhotoReview()');
  const end = app.indexOf('function clearDriverPhotoReview()', start);
  for (const allowed of [true, false]) {
    const card = { hidden: true };
    const button = { disabled: false };
    const target = { textContent: '' };
    const elements = {
      'driver-photo-review-card': card,
      'driver-photo-queue-button': button,
      'driver-photo-review-result': target,
    };
    vm.runInNewContext(app.slice(start, end) + '\ndiscoverDriverPhotoReview();', {
      state: { token: 'fixture' },
      byId: (id) => elements[id],
      hasScope: (scope) => scope === 'drivers:documents:read' && allowed,
    });
    assert.equal(card.hidden, false);
    assert.equal(button.disabled, !allowed);
    assert.match(target.textContent, allowed ? /fotos enviadas/ : /permissão/);
  }
});

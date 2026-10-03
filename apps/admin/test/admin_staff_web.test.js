import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Admin expõe gestão de funcionários somente ao proprietário', async () => {
  const [index, app, api, page] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../pages/staff.html', import.meta.url), 'utf8'),
  ]);

  assert.match(index, /\/admin\/funcionarios/);
  assert.match(app, /capabilities\?\.manageStaff/);
  assert.match(app, /support:read/);
  assert.match(app, /support:write/);
  assert.match(api, /\/v1\/admin\/staff/);
  assert.match(page, /data-staff-create-scope="finance:write"/);
  assert.match(page, /data-staff-create-scope="support:write"/);
  assert.match(page, /id="staff-access-toggle-button"/);
  assert.match(page, /id="staff-delete-button"/);
  assert.match(page, /Credenciais iniciais/);
});

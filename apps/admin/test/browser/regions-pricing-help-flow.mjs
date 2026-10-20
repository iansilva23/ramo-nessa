import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export async function testPricingHelp(page, out, engine) {
  const requests = [];
  const record = request => { if (new URL(request.url()).pathname.startsWith('/v1/')) requests.push(request.method()); };
  page.on('request', record);
  try {
    const open = page.getByRole('button', {name: 'Ajuda e tutoriais', exact: true});
    await open.click();
    const manual = page.getByRole('dialog', {name: 'Ajuda e tutoriais', exact: true});
    await manual.waitFor({state: 'visible'});
    const search = manual.getByRole('searchbox', {name: 'O que você precisa entender?', exact: true});
    assert.equal(await search.evaluate(n => document.activeElement === n), true);
    const article = manual.locator('.rp-help-article');
    assert.match(await article.textContent(), /Como organizar sua operação/);
    await search.fill('largura inteira');
    assert.equal(await manual.locator('.rp-help-chapter').count(), 1);
    assert.match(await article.textContent(), /diâmetro/);
    await search.fill('CODIGO MFA');
    assert.ok(await manual.locator('[data-chapter="security"]').count());
    await manual.locator('[data-chapter="security"]').click();
    assert.match(await article.textContent(), /código novo/);
    assert.equal(await article.evaluate(n => document.activeElement === n), true);
    await search.fill('<img src=x onerror=alert(1)>');
    assert.equal(await manual.locator('.rp-help-chapter').count(), 0);
    assert.equal(await manual.locator('img').count(), 0);
    assert.match(await manual.textContent(), /Nenhum capítulo encontrado/);
    await manual.getByRole('button', {name: 'Limpar busca', exact: true}).click();
    assert.equal(await manual.locator('.rp-help-chapter').count(), 18);
    assert.match(await article.textContent(), /Como organizar sua operação/);
    await manual.locator('[data-chapter="extras"]').click();
    assert.match(await article.textContent(), /não cria uma condição automática/);
    await article.getByRole('button', {name: 'Horários, dia e noite', exact: true}).click();
    assert.match(await article.textContent(), /Início do dia/);
    for (const width of [1440, 860, 390]) {
      await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
      // Select the longer field-by-field chapter for layout/reading evidence.
      await manual.locator('[data-chapter="rate"]').click();
      assert.equal(await manual.evaluate(n => n.scrollWidth > n.clientWidth + 1), false, 'Manual overflow at ' + width);
      assert.equal(await article.evaluate(n => n.scrollWidth > n.clientWidth + 1), false, 'Article overflow at ' + width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.keyboard.press('Tab');
      assert.equal(await manual.evaluate(n => n.contains(document.activeElement)), true, 'Focus must stay in manual');
      await manual.locator('[data-chapter="rate"]').click();
      await page.screenshot({path: resolve(out, engine + '-help-' + width + '.png')});
      if (engine === 'chromium') {
        console.log('RP_HELP_PREVIEW_' + width + ':' + (await page.screenshot({type: 'jpeg', quality: 45})).toString('base64'));
      }
    }
    await page.keyboard.press('Escape');
    await manual.waitFor({state: 'detached'});
    assert.equal(await open.evaluate(n => document.activeElement === n), true);
    await page.setViewportSize({width: 1440, height: 1000});
    assert.deepEqual(requests, [], 'Reading and searching help must not call the API');
  } finally { page.off('request', record); }
}

export async function testEditorHelp(page, editor, label, topicText) {
  const trigger = editor.getByRole('button', {name: 'Ajuda: ' + label, exact: true});
  // The MFA dialog is created after an HTTP challenge. Wait for its controls
  // before snapshotting; evaluateAll alone does not wait for DOM insertion.
  await trigger.waitFor({state: 'visible'});
  const before = await editor.locator('input,select').evaluateAll(inputs => inputs.map(n => [n.value, n.checked, n.disabled]));
  await trigger.click();
  const manual = page.getByRole('dialog', {name: 'Ajuda e tutoriais', exact: true});
  await manual.waitFor({state: 'visible'});
  assert.match(await manual.locator('.rp-help-article').textContent(), topicText);
  await page.keyboard.press('Escape');
  await manual.waitFor({state: 'detached'});
  assert.equal(await editor.isVisible(), true);
  assert.equal(await trigger.evaluate(n => document.activeElement === n), true);
  assert.deepEqual(await editor.locator('input,select').evaluateAll(inputs => inputs.map(n => [n.value, n.checked, n.disabled])), before);
}

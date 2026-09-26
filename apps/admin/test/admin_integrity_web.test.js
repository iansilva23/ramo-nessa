import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const pagesDir = new URL('../pages/', import.meta.url);

async function adminSource() {
  const [index, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  ]);
  return { index, app };
}

async function pageSources() {
  const names = (await readdir(pagesDir))
    .filter((name) => name.endsWith('.html'))
    .sort();

  return Promise.all(
    names.map(async (name) => ({
      name,
      source: await readFile(
        new URL('../pages/' + name, import.meta.url),
        'utf8',
      ),
    })),
  );
}

function regexEscape(value) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
}

test('ADM não possui IDs duplicados em shell ou páginas', async () => {
  const { index } = await adminSource();
  const pages = await pageSources();

  for (const [name, source] of [
    ['index.html', index],
    ...pages.map((page) => [page.name, page.source]),
  ]) {
    const ids = [...source.matchAll(/\\bid=["']([^"']+)["']/g)]
      .map((match) => match[1]);
    const seen = new Set();

    for (const id of ids) {
      assert.equal(
        seen.has(id),
        false,
        name + ' contém ID duplicado: ' + id,
      );
      seen.add(id);
    }
  }
});

test('todo controle identificado nas páginas possui ligação no controlador', async () => {
  const { app } = await adminSource();
  const pages = await pageSources();

  for (const page of pages) {
    const interactiveIds = [
      ...page.source.matchAll(
        /<(?:button|form|input|select|textarea)\\b[^>]*\\bid=["']([^"']+)["']/g,
      ),
    ].map((match) => match[1]);

    for (const id of interactiveIds) {
      assert.equal(
        app.includes("'" + id + "'") ||
          app.includes('"' + id + '"'),
        true,
        page.name + ': controle #' + id + ' não está ligado ao app.js',
      );
    }
  }
});

test('rotas do menu correspondem às páginas registradas', async () => {
  const { index, app } = await adminSource();
  const pages = await pageSources();
  const pageNames = new Set(
    pages.map((page) => page.name.replace(/\\.html$/, '')),
  );

  const nav = [
    ...index.matchAll(
      /href=["'](\\/admin\\/[^"']+)["'][^>]*data-view=["']([^"']+)["']/g,
    ),
  ].map((match) => ({
    path: match[1],
    view: match[2],
  }));

  assert.ok(nav.length > 0, 'menu do Admin não pode ficar vazio');

  for (const item of nav) {
    const routePattern = new RegExp(
      regexEscape(item.view) +
        '\\s*:\\s*\\{[\\s\\S]*?path:\\s*[\\'"]' +
        regexEscape(item.path) +
        '[\\'"][\\s\\S]*?page:\\s*[\\'"]([^\\'"]+)[\\'"]',
    );
    const route = app.match(routePattern);
    assert.ok(
      route,
      'rota ' + item.view + ' (' + item.path + ') não está registrada',
    );
    assert.equal(
      pageNames.has(route[1]),
      true,
      'rota ' + item.view + ' aponta para página inexistente: ' + route[1],
    );
  }
});

test('ADM evita execução HTML inline e innerHTML', async () => {
  const { index, app } = await adminSource();
  const pages = await pageSources();
  const html = [index, ...pages.map((page) => page.source)].join('\n');

  assert.equal(/\\son(?:click|change|submit|input|load)=/i.test(html), false);
  assert.equal(/<script\\b/i.test(html), false);
  assert.equal(app.includes('.innerHTML'), false);
  assert.equal(app.includes('insertAdjacentHTML'), false);
});

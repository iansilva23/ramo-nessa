import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const pagesDir = new URL('../pages/', import.meta.url);

async function adminSource() {
  const [index, app, localities, coupons] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    // Loaded below alongside the other isolated page controllers.
    readFile(
      new URL('../src/localities-admin.js', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../src/promotions-admin.js', import.meta.url), 'utf8'),
  ]);
  return {
    index,
    app,
    controls: app + '\n' + localities + '\n' + coupons,
  };
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
    const ids = [...source.matchAll(/\bid=["']([^"']+)["']/g)]
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
  const { controls } = await adminSource();
  const pages = await pageSources();

  for (const page of pages) {
    const interactiveIds = [
      ...page.source.matchAll(
        /<(?:button|form|input|select|textarea)\b[^>]*\bid=["']([^"']+)["']/g,
      ),
    ].map((match) => match[1]);

    for (const id of interactiveIds) {
      assert.equal(
        controls.includes("'" + id + "'") ||
          controls.includes('"' + id + '"'),
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
    pages.map((page) => page.name.replace(/\.html$/, '')),
  );

  const nav = [
    ...index.matchAll(
      /href=["'](\/admin\/[^"']+)["'][^>]*data-view=["']([^"']+)["']/g,
    ),
  ].map((match) => ({
    path: match[1],
    view: match[2],
  }));

  assert.ok(nav.length > 0, 'menu do Admin não pode ficar vazio');

  const routesStart = app.indexOf(
    'const adminRoutes = Object.freeze({',
  );
  const routesEnd = app.indexOf('\n});', routesStart);
  assert.ok(
    routesStart >= 0 && routesEnd > routesStart,
    'registro de rotas do Admin não foi encontrado',
  );
  const routesSource = app.slice(routesStart, routesEnd);

  for (const item of nav) {
    const entryStart = routesSource.indexOf(
      '  ' + item.view + ': {',
    );
    assert.notEqual(
      entryStart,
      -1,
      'rota ' + item.view + ' não está registrada',
    );
    const entryEnd = routesSource.indexOf(
      '\n  },',
      entryStart,
    );
    assert.notEqual(
      entryEnd,
      -1,
      'bloco da rota ' + item.view + ' está incompleto',
    );
    const entry = routesSource.slice(entryStart, entryEnd);
    assert.equal(
      entry.includes("path: '" + item.path + "'"),
      true,
      'rota ' + item.view + ' usa caminho diferente de ' + item.path,
    );
    const page = entry.match(/page:\s*['"]([^'"]+)['"]/);
    assert.ok(
      page,
      'rota ' + item.view + ' não registra página',
    );
    assert.equal(
      pageNames.has(page[1]),
      true,
      'rota ' + item.view + ' aponta para página inexistente: ' + page[1],
    );
  }
});

test('ADM evita execução HTML inline e innerHTML', async () => {
  const { index, app } = await adminSource();
  const pages = await pageSources();
  const html = [index, ...pages.map((page) => page.source)].join('\n');

  assert.equal(/\son(?:click|change|submit|input|load)=/i.test(html), false);

  const scripts = [
    ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  ];
  for (const script of scripts) {
    const attributes = script[1] ?? '';
    const body = script[2] ?? '';
    const src = attributes.match(/\bsrc=["']([^"']+)["']/i)?.[1];

    assert.ok(src, 'scripts do Admin precisam usar arquivo externo');
    assert.equal(
      /^(?:https?:|data:|javascript:)/i.test(src),
      false,
      'script externo precisa permanecer na mesma origem',
    );
    assert.equal(
      body.trim(),
      '',
      'JavaScript inline não é permitido no Admin',
    );
  }

  assert.equal(app.includes('.innerHTML'), false);
  assert.equal(app.includes('insertAdjacentHTML'), false);
});

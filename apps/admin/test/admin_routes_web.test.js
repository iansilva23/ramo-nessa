import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = [
  ['overview', 'visao-geral'],
  ['fleet', 'frota'],
  ['rides', 'viagens'],
  ['drivers', 'motoristas'],
  ['passengers', 'passageiros'],
  ['pricing', 'precos'],
  ['finance', 'financeiro'],
  ['notifications', 'notificacoes'],
  ['support', 'suporte'],
  ['agency', 'passeios'],
  ['integrations', 'integracoes'],
  ['audit', 'auditoria'],
];

test('Admin usa shell + rotas próprias em vez de uma página monolítica', async () => {
  const index = await readFile(
    new URL('../index.html', import.meta.url),
    'utf8',
  );

  assert.match(index, /id=["']route-outlet["']/);
  assert.match(index, /id=["']mobile-menu-button["']/);
  assert.equal(
    (index.match(/id=["']mobile-nav-backdrop["']/g) ?? []).length,
    1,
    'o menu móvel deve ter um único backdrop',
  );

  for (const [view, path] of routes) {
    assert.match(
      index,
      new RegExp(
        `href=["']/admin/${path}["'][^>]*data-view=["']${view}["']`,
      ),
    );
    assert.equal(
      index.includes(`id="view-${view}"`),
      false,
      `${view} não deve voltar ao index monolítico`,
    );
  }
});

test('cada módulo administrativo possui um arquivo de página isolado', async () => {
  for (const [view] of routes) {
    const html = await readFile(
      new URL(`../pages/${view}.html`, import.meta.url),
      'utf8',
    );
    assert.match(
      html,
      new RegExp(
        `^<section id=["']view-${view}["'][^>]*class=["'][^"']*view-panel`,
      ),
    );
    assert.equal(
      (
        html.match(
          /<section\b[^>]*class=["'][^"']*\bview-panel\b[^"']*["'][^>]*>/g,
        ) ?? []
      ).length,
      1,
      `${view} deve montar apenas um painel principal`,
    );
  }
});

test('roteador preserva sessão em memória e navega sem recarregar a aplicação', async () => {
  const app = await readFile(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  assert.match(app, /const adminRoutes = Object\.freeze/);
  assert.match(app, /\/admin\/frota/);
  assert.match(app, /\/admin\/passeios/);
  assert.match(app, /loadRouteMarkup/);
  assert.match(app, /\/admin\/pages\/\$\{encodeURIComponent\(route\.page\)\}\.html/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /window\.history\.replaceState/);
  assert.match(app, /window\.addEventListener\('popstate'/);
  assert.match(app, /routeOutlet\.replaceChildren/);

  assert.equal(app.includes('localStorage'), false);
  assert.equal(app.includes('sessionStorage'), false);
  assert.equal(app.includes('.innerHTML'), false);
});

test('build e gateway publicam as páginas e aceitam deep links do Admin', async () => {
  const [dockerfile, caddy] = await Promise.all([
    readFile(new URL('../Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../Caddyfile', import.meta.url), 'utf8'),
  ]);

  assert.match(dockerfile, /COPY pages \/srv\/admin\/pages/);
  assert.match(caddy, /handle_path \/admin\/\*/);
  assert.match(caddy, /try_files \{path\} \/index\.html/);
});

test('layout mantém navegação desktop e menu móvel responsivo', async () => {
  const css = await readFile(
    new URL('../styles.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /\.sidebar\s*\{/);
  assert.match(css, /\.admin-main\s*\{/);
  assert.match(css, /\.mobile-menu-button\s*\{/);
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /body\.nav-open \.sidebar/);
  assert.match(css, /\.route-outlet\s*\{/);
  assert.match(css, /\.route-loading\s*\{/);
});

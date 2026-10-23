import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium, webkit} = await import(process.env.RAMO_GUIDE_PLAYWRIGHT_MODULE ?? new URL('../../../../scripts/web/browser-tests/node_modules/playwright/index.mjs', import.meta.url).href);
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const output = resolve(root, 'workspace-browser-artifacts');
await mkdir(output, {recursive:true});
const files = (await readdir(resolve(root, 'pages'))).filter(name => name.endsWith('.html'));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      const shell = await readFile(resolve(root, 'index.html'), 'utf8');
      res.setHeader('content-type', 'text/html');
      res.end(shell.replace('<script type="module" src="src/app.js"></script>', ''));
      return;
    }
    const path = resolve(root, '.' + url.pathname);
    if (!path.startsWith(root + sep)) throw Error('Invalid path');
    const bytes = await readFile(path);
    res.setHeader('content-type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(path)] ?? 'application/octet-stream');
    res.end(bytes);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
try {
  for (const engine of (process.env.RAMO_GUIDE_ENGINES ?? 'chromium,webkit').split(',')) {
    const browser = await (engine === 'webkit' ? webkit : chromium).launch({headless:true});
    const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const settleLayout = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const errors = [], results = [], layoutErrors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin);
    await page.evaluate(async () => {
      const {organizeAdminNavigation, syncAdminNavigation} = await import('/src/admin-workspace.js');
      document.getElementById('auth-view').hidden = true;
      document.getElementById('admin-view').hidden = false;
      const nav = document.querySelector('.sidebar-nav');
      const links = [...nav.querySelectorAll('.nav-item')];
      const before = links.map(link => [link.dataset.view, link.href]);
      organizeAdminNavigation(nav);
      if (links.some(link => !link.isConnected)) throw Error('A route was removed');
      for (const [view, href] of before) if (nav.querySelector(`[data-view="${view}"]`).href !== href) throw Error('Route changed');
      links.forEach(link => link.hidden = link.dataset.view !== 'overview');
      syncAdminNavigation(nav);
      if ([...nav.querySelectorAll('.admin-nav-group')].filter(group => !group.hidden).length !== 1) throw Error('Empty permission group visible');
      if (links.some(link => link.dataset.view !== 'overview' && !link.hidden)) throw Error('Permission was unhidden');
      links.forEach(link => link.hidden = false);
      syncAdminNavigation(nav);
    });
    for (const file of files) {
      const markup = await readFile(resolve(root, 'pages', file), 'utf8');
      const result = await page.evaluate(async ({markup, file}) => {
        const {organizeAdminWorkspace} = await import('/src/admin-workspace.js');
        const parsed = new DOMParser().parseFromString(markup, 'text/html');
        const panel = document.importNode(parsed.querySelector('.view-panel'), true);
        panel.hidden = false;
        const view = panel.id.slice(5);
        document.getElementById('route-outlet').replaceChildren(panel);
        const fields = [...panel.querySelectorAll('input,select,textarea,button')];
        const snapshot = field => ({id:field.id, name:field.name, type:field.type, required:field.required, disabled:field.disabled, value:field.value, checked:field.checked, min:field.min, max:field.max, pattern:field.pattern, form:field.form?.id, hidden:!!field.closest('[hidden]')});
        const before = fields.map(snapshot);
        const pricingBefore = panel.outerHTML;
        organizeAdminWorkspace(panel, view);
        organizeAdminWorkspace(panel, view);
        document.getElementById('page-title').textContent = panel.querySelector('h1')?.textContent ?? view;
        document.querySelectorAll('.nav-item').forEach(link => link.classList.toggle('is-active', link.dataset.view === view));
        fields.forEach((field, index) => {
          if (!field.isConnected || JSON.stringify(snapshot(field)) !== JSON.stringify(before[index])) throw Error(`Changed field: ${file} ${field.id || field.name}`);
        });
        if (view === 'pricing' && panel.outerHTML !== pricingBefore) throw Error('Approved pricing workspace changed');
        return {file, view, fields:fields.length, groups:panel.querySelectorAll('.admin-field-group').length};
      }, {markup, file});
      results.push(result);
      for (const width of [1440,390,320]) {
        await page.setViewportSize({width,height:1000});
        await settleLayout();
        await page.evaluate(() => window.scrollTo(0,0));
        const overflow = await page.evaluate(() => ({width:innerWidth, scroll:document.documentElement.scrollWidth, elements:[...document.querySelectorAll('#route-outlet *')].filter(element => element.getBoundingClientRect().right > innerWidth+1 && element.getBoundingClientRect().width > 0).slice(0,10).map(element => ({tag:element.tagName,id:element.id,class:element.className,width:element.getBoundingClientRect().width}))}));
        if (overflow.scroll > overflow.width + 1) {
          overflow.debug = await page.evaluate(() => ({body: {scroll:document.body.scrollWidth,client:document.body.clientWidth,x:scrollX}, wide:[...document.querySelectorAll('body *')].filter(element => element.scrollWidth > element.clientWidth+10).slice(0,25).map(element => ({tag:element.tagName,id:element.id,class:element.className,scroll:element.scrollWidth,client:element.clientWidth,rect:element.getBoundingClientRect().toJSON(),overflow:getComputedStyle(element).overflow,contain:getComputedStyle(element).contain,display:getComputedStyle(element).display}))}));
          await page.screenshot({path:resolve(output, `${engine}-${file}-${width}-overflow.png`),fullPage:true});
        }
        if (overflow.scroll > overflow.width + 1) layoutErrors.push(`${file}: overflow at ${width}: ${JSON.stringify(overflow)}`);
      }
      if (['finance','drivers','staff','coupons','marketing','notifications','guide','costs'].some(name => file === name + '.html')) {
        await page.setViewportSize({width:1440,height:1000});
        await settleLayout();
        await page.screenshot({path:resolve(output,`${engine}-${file.replace('.html','')}-desktop.png`),fullPage:true,animations:'disabled'});
        await page.setViewportSize({width:390,height:844});
        await settleLayout();
        await page.screenshot({path:resolve(output,`${engine}-${file.replace('.html','')}-mobile.png`),fullPage:true,animations:'disabled'});
      }
      if (file === 'coupons.html') {
        await page.locator('#coupon-name').fill('Campanha de teste');
        const nav = page.getByRole('navigation', {name:'Ir para uma parte desta página'});
        if (await nav.count()) await nav.locator('select').selectOption('0');
        assert.equal(await page.locator('#coupon-name').inputValue(), 'Campanha de teste');
      }
      if (file === 'costs.html') {
        await page.evaluate(() => document.getElementById('cost-rule-form').reportValidity());
        assert.equal(await page.locator('#cost-rule-editor').getAttribute('open'), '');
        assert.equal(await page.locator('#cost-rule-name').isVisible(), true);
      }
      if (file === 'staff.html') {
        const check = page.locator('[data-staff-create-scope="finance:write"]');
        await check.check();
        assert.equal(await check.isChecked(), true);
        assert.equal(await check.evaluate(input => input.form.id), 'staff-create-form');
      }
    }
    assert.deepEqual(layoutErrors, []);
    assert.deepEqual(errors, []);
    await writeFile(resolve(output, `${engine}-inventory.json`), JSON.stringify({engine,results,errors},null,2));
    console.log(`${engine}: ${results.length} pages retain controls, values, form associations, validation and permissions; desktop/mobile checked`);
    await browser.close();
  }
} finally {await new Promise(done => server.close(done));}

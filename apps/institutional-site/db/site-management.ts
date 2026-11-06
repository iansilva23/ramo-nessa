import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { contentSchema, defaultContent, SiteError, type SiteContent } from '../lib/site-content.ts';

export function openSiteManagement(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS site_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, draft TEXT NOT NULL, published TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS site_releases (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, actor TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS site_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS interest_reviews (id TEXT PRIMARY KEY, status TEXT NOT NULL, notes TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS site_assets (id TEXT PRIMARY KEY, extension TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
  `);
  db.prepare('INSERT OR IGNORE INTO site_state VALUES (1,0,?,?)').run(JSON.stringify(defaultContent), JSON.stringify(defaultContent));
  function transaction<T>(fn: () => T): T { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  function audit(actor: string, action: string, target: string) { db.prepare('INSERT INTO site_audit(actor,action,target,created_at) VALUES(?,?,?,?)').run(actor,action,target,Date.now()); }
  function state() { const r = db.prepare('SELECT * FROM site_state WHERE id=1').get()!; return { revision: Number(r.revision), draft: JSON.parse(String(r.draft)) as SiteContent, published: JSON.parse(String(r.published)) as SiteContent }; }
  function checkRevision(expected: number) { if (state().revision !== expected) throw new SiteError(409, 'Outra pessoa alterou o site. Atualize antes de salvar.'); }
  function checkAssets(content: SiteContent) {
    const refs = [content.heroImage,content.appIcon,content.driverIcon,...content.apps.flatMap(a=>[a.apkHref])];
    for (const ref of refs) if (ref.startsWith('/media/')) {
      const row = db.prepare('SELECT id FROM site_assets WHERE id=? AND extension=?').get(ref.slice(7,71), ref.split('.').pop()!);
      if (!row) throw new SiteError(400,'Arquivo enviado não encontrado.');
    }
  }
  return {
    state,
    saveDraft(content: unknown, revision: number, actor: string) { return transaction(()=>{checkRevision(revision); const parsed=contentSchema.parse(content); checkAssets(parsed); db.prepare('UPDATE site_state SET draft=?,revision=revision+1 WHERE id=1').run(JSON.stringify(parsed)); audit(actor,'draft.saved','site'); return state();}); },
    publish(revision: number, actor: string) { return transaction(()=>{checkRevision(revision);const s=state(); db.prepare('INSERT INTO site_releases(content,actor,created_at) VALUES(?,?,?)').run(JSON.stringify(s.published),actor,Date.now()); db.prepare('UPDATE site_state SET published=draft,revision=revision+1 WHERE id=1').run(); audit(actor,'site.published','site');return state();}); },
    restore(id: number, revision: number, actor: string) { return transaction(()=>{checkRevision(revision);const row=db.prepare('SELECT content FROM site_releases WHERE id=?').get(id); if(!row)throw new SiteError(404,'Versão não encontrada.'); db.prepare('UPDATE site_state SET draft=?,revision=revision+1 WHERE id=1').run(String(row.content));audit(actor,'draft.restored',String(id));return state();}); },
    releases() { return db.prepare('SELECT id,actor,created_at FROM site_releases ORDER BY id DESC LIMIT 30').all(); },
    audit() { return db.prepare('SELECT * FROM site_audit ORDER BY id DESC LIMIT 100').all(); },
    leads(status: string, query: string, page: number) {
      // LEFT JOIN retains every pre-existing public form record.
      const where = `WHERE (?='' OR COALESCE(r.status,'new')=?) AND (?='' OR instr(lower(i.name),lower(?))>0 OR instr(i.phone,?)>0)`;
      const params=[status,status,query,query,query];
      const count=db.prepare(`SELECT count(*) AS total FROM driver_interests i LEFT JOIN interest_reviews r ON r.id=i.id ${where}`).get(...params)!;
      const items=db.prepare(`SELECT i.*,COALESCE(r.status,'new') AS status,COALESCE(r.notes,'') AS notes,COALESCE(r.revision,0) AS revision FROM driver_interests i LEFT JOIN interest_reviews r ON r.id=i.id ${where} ORDER BY i.created_at DESC,i.id LIMIT 30 OFFSET ?`).all(...params,(page-1)*30);
      return {items,total:Number(count.total),page};
    },
    review(id: string, status: string, notes: string, revision: number, actor: string) { transaction(()=>{
      if(!db.prepare('SELECT id FROM driver_interests WHERE id=?').get(id))throw new SiteError(404,'Solicitação não encontrada.');
      const row=db.prepare('SELECT revision FROM interest_reviews WHERE id=?').get(id);
      if(Number(row?.revision??0)!==revision)throw new SiteError(409,'Solicitação alterada. Atualize a lista.');
      db.prepare('INSERT INTO interest_reviews VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,notes=excluded.notes,revision=excluded.revision,updated_at=excluded.updated_at').run(id,status,notes,revision+1,Date.now());audit(actor,'interest.reviewed',id);
    }); },
    registerAsset(id: string, extension: string, mime: string, size: number, actor: string) { transaction(()=>{db.prepare('INSERT OR IGNORE INTO site_assets VALUES(?,?,?,?,?)').run(id,extension,mime,size,Date.now());audit(actor,'asset.uploaded',id);}); },
    asset(id: string, ext: string) { return db.prepare('SELECT * FROM site_assets WHERE id=? AND extension=?').get(id,ext); },
    isPublishedAsset(path: string) { const s=state().published; return [s.heroImage,s.appIcon,s.driverIcon,...s.apps.flatMap(a=>[a.apkHref])].includes(path); },
    close() { db.close(); },
  };
}
let current: ReturnType<typeof openSiteManagement> | undefined;
export function siteManagement() { current ??= openSiteManagement(process.env.INTERESTS_DB_PATH ?? '/var/lib/ramo-site/interests.sqlite'); return current; }

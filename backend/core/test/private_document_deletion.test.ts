import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HttpPrivateDocumentStorage, LocalPrivateDocumentStorage } from '../src/drivers/driver-document-private-storage.js';

test('local deletion removes only the requested object and is safe to retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rn-private-delete-'));
  try {
    const storage = new LocalPrivateDocumentStorage(root);
    await storage.write('drivers/test/license/a.pdf', {bytes:Buffer.from('first'),contentType:'application/pdf'});
    await storage.write('drivers/other/license/b.pdf', {bytes:Buffer.from('keep'),contentType:'application/pdf'});
    await storage.delete('drivers/test/license/a.pdf');
    await storage.delete('drivers/test/license/a.pdf');
    await assert.rejects(storage.read('drivers/test/license/a.pdf'));
    assert.equal((await storage.read('drivers/other/license/b.pdf')).bytes.toString(), 'keep');
  } finally { await rm(root, {recursive:true,force:true}); }
});

test('local deletion rejects traversal, directories and symlinks without touching outside data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rn-private-guard-'));
  const outside = await mkdtemp(join(tmpdir(), 'rn-outside-guard-'));
  try {
    const storage = new LocalPrivateDocumentStorage(root);
    await writeFile(join(outside, 'protected.pdf'), 'keep');
    await storage.write('drivers/test/keep.pdf', {bytes:Buffer.from('keep'),contentType:'application/pdf'});
    await assert.rejects(storage.delete('drivers/test'));
    await symlink(outside, join(root, 'linked'));
    await symlink(join(outside, 'protected.pdf'), join(root, 'link.pdf'));
    for (const key of ['../protected.pdf', '/protected.pdf', 'drivers/./a.pdf', 'linked/protected.pdf', 'link.pdf', 'linked//protected.pdf']) {
      await assert.rejects(storage.delete(key));
    }
    await assert.rejects(storage.delete('linked'));
    assert.equal(await readFile(join(outside, 'protected.pdf'), 'utf8'), 'keep');
  } finally {
    await rm(root, {recursive:true,force:true});
    await rm(outside, {recursive:true,force:true});
  }
});

test('HTTP deletion authenticates and accepts only completed deletion or absence', async () => {
  const requests: {method:string|undefined;url:string|undefined;authorization:string|undefined}[] = [];
  let status = 204;
  const server = createServer((request,response) => {
    requests.push({method:request.method,url:request.url,authorization:request.headers.authorization});
    response.writeHead(status);response.end();
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address();assert.ok(address && typeof address !== 'string');
  const storage = new HttpPrivateDocumentStorage(new URL(`http://127.0.0.1:${address.port}/objects/`), 'synthetic-private-token');
  try {
    for (const value of [204,404,200]) { status=value;await storage.delete('drivers/test/a.pdf'); }
    for (const value of [202,401,500]) { status=value;await assert.rejects(storage.delete('drivers/test/a.pdf')); }
    const count = requests.length;
    await assert.rejects(storage.delete('../protected.pdf'));
    assert.equal(requests.length,count);
    assert.ok(requests.every(r => r.method==='DELETE' && r.url==='/objects/drivers/test/a.pdf' && r.authorization==='Bearer synthetic-private-token'));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

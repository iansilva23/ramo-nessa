import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync,lstatSync,symlinkSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runtimeContract,activeWeb,activeCaddy,validateRuntime,validateMigrations,ensureSandboxDataDirectory} from './asaas-runtime-contract.mjs';
const runtime=()=>Object.fromEntries(Object.entries(runtimeContract).map(([k,v])=>[k,{Name:'/'+v.name,Image:v.image??'postgres-fixture',State:{Health:{Status:'healthy'}},Mounts:k==='gateway'?[{Type:'bind',Source:activeWeb,Destination:'/srv/web',RW:false},{Type:'bind',Source:activeCaddy,Destination:'/etc/caddy/Caddyfile',RW:false}]:[]} ]));
test('only the inspected runtime with the real pricing web mount can prepare',()=>{assert.doesNotThrow(()=>validateRuntime(runtime()));const wrong=runtime();wrong.gateway.Mounts[0].Source='/opt/ramo-nessa-web/releases/aab0b0c36fe1/bundles';assert.throws(()=>validateRuntime(wrong),/Mount ativo diferente/);});
test('refuses a newer core or gateway rather than overwriting other-chat updates',()=>{for(const k of ['core','gateway']){const s=runtime();s[k].Image='sha256:newer';assert.throws(()=>validateRuntime(s),/Runtime diferente/);}});
test('requires a healthy database and site before preparing',()=>{for(const k of ['postgres','site']){const s=runtime();s[k].State.Health.Status='unhealthy';assert.throws(()=>validateRuntime(s),/sem saúde/);}});
test('migration gate requires exactly 086 pending and unchanged checksums',()=>{const applied=[{filename:'085_web_push_preferences.sql',checksum:'old'}],candidate={'085_web_push_preferences.sql':'old','086_asaas_driver_payouts.sql':'new'};assert.deepEqual(validateMigrations(applied,candidate),['086_asaas_driver_payouts.sql']);assert.throws(()=>validateMigrations([{...applied[0],checksum:'changed'}],candidate),/Migration diferente/);assert.throws(()=>validateMigrations([...applied,{filename:'086_asaas_driver_payouts.sql',checksum:'new'}],candidate),/pendentes diferentes/);});
test('refuses extra pending migrations or unknown applied migrations',()=>{const row={filename:'085_web_push_preferences.sql',checksum:'old'};assert.throws(()=>validateMigrations([row],{[row.filename]:'old','086_asaas_driver_payouts.sql':'new','087_other.sql':'other'}),/pendentes diferentes/);assert.throws(()=>validateMigrations([row],{'086_asaas_driver_payouts.sql':'new'}),/Migration diferente/);});

test('host-session restart reuses existing data and preserves payout IDs and POST journal',()=>{
 const root=mkdtempSync(join(tmpdir(),'asaas-restart-')),data=join(root,'data'),owner=process.getuid();
 try {
  ensureSandboxDataDirectory(data,owner);
  const session=join(data,'session.json'),journal=join(data,'http-intents.jsonl');
  const content=JSON.stringify({payoutId:'existing-payout-uuid',transferId:'existing-transfer-uuid'});
  writeFileSync(session,content,{mode:0o600});writeFileSync(journal,'{"method":"POST"}\n',{mode:0o600});
  const before=lstatSync(session),directory=lstatSync(data);
  ensureSandboxDataDirectory(data,owner);
  assert.equal(lstatSync(data).ino,directory.ino);assert.equal(lstatSync(session).ino,before.ino);assert.equal(lstatSync(session).mtimeMs,before.mtimeMs);
  assert.equal(readFileSync(session,'utf8'),content);assert.equal(readFileSync(journal,'utf8'),'{"method":"POST"}\n');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('host-session restart refuses symlinks and insecure directories without repairing or replacing them',()=>{
 const root=mkdtempSync(join(tmpdir(),'asaas-dir-guards-')),target=join(root,'target'),link=join(root,'link'),owner=process.getuid();
 try {
  mkdirSync(target,{mode:0o700});writeFileSync(join(target,'sentinel'),'preserve');symlinkSync(target,link);
  assert.throws(()=>ensureSandboxDataDirectory(link,owner),/Diretório/);assert.equal(readFileSync(join(target,'sentinel'),'utf8'),'preserve');
  chmodSync(target,0o755);assert.throws(()=>ensureSandboxDataDirectory(target,owner),/Diretório/);assert.equal(lstatSync(target).mode&0o777,0o755);
 }finally{rmSync(root,{recursive:true,force:true});}
});

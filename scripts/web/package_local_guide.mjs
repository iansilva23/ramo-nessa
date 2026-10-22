// Offline deterministic payload. No provider or server access.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {guideSource,guideBase,baselineCore,dependencyLock,coreDelta,adminDelta,migration,assertGuideManifest} from '../../deploy/staging/local-guide-web-contract.mjs';
const [baseArg,outputArg]=process.argv.slice(2);if(!baseArg||!outputArg)throw Error('baseline directory and output required');
const base=resolve(baseArg),output=resolve(outputArg),hash=b=>createHash('sha256').update(b).digest('hex');
function files(root,filter=()=>true){const rows=[];function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){const q=join(p,e.name);if(e.isSymbolicLink())throw Error('Unexpected symlink');if(e.isDirectory())walk(q);else if(e.isFile()&&filter(relative(root,q)))rows.push([relative(root,q),hash(readFileSync(q))]);}}walk(root);return rows.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);}
const before=files(join(base,'backend/core/dist/src'),p=>p.endsWith('.js')),after=files('backend/core/dist/src',p=>p.endsWith('.js'));
const old=new Map(before),next=new Map(after),delta=[...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).sort();
if(JSON.stringify(delta)!==JSON.stringify(coreDelta)||hash(JSON.stringify(before))!==baselineCore)throw Error('Unreviewed compiled Core delta/baseline');
if(hash(readFileSync('backend/core/package-lock.json'))!==dependencyLock||!readFileSync('backend/core/package-lock.json').equals(readFileSync(join(base,'backend/core/package-lock.json'))))throw Error('Dependency changed');
execFileSync('git',['diff','--exit-code',guideSource,'HEAD','--','backend','apps','packages','config/web'],{stdio:'pipe'});
const runtimeAdmin=root=>['index.html','styles.css','favicon.svg'].map(p=>[p,hash(readFileSync(join(root,p)))]).concat(...['src','pages'].map(p=>files(join(root,p)).map(([f,h])=>[p+'/'+f,h]))).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
const baselineAdmin=runtimeAdmin(join(base,'apps/admin')),candidateAdmin=runtimeAdmin('apps/admin'),oldAdmin=new Map(baselineAdmin),newAdmin=new Map(candidateAdmin);
if(JSON.stringify([...new Set([...oldAdmin.keys(),...newAdmin.keys()])].filter(p=>oldAdmin.get(p)!==newAdmin.get(p)).sort())!==JSON.stringify(adminDelta))throw Error('Unreviewed admin delta');
const baselineMigrations=files(join(base,'backend/core/migrations')).map(([filename,checksum])=>({filename,checksum}));
for(const r of baselineMigrations)if(hash(readFileSync('backend/core/migrations/'+r.filename))!==r.checksum)throw Error('Old migration modified');
if(JSON.stringify(readdirSync('backend/core/migrations').sort())!==JSON.stringify([...baselineMigrations.map(r=>r.filename),migration].sort()))throw Error('Unexpected migration');
mkdirSync(output,{recursive:false});const m={format:1,source:guideSource,baseline:guideBase,baselineCore,candidateCore:hash(JSON.stringify(after)),lock:dependencyLock,coreDelta,adminDelta,baselineAdmin,candidateAdmin,baselineMigrations,files:[]};
function add(from,path){const bytes=readFileSync(from),target=join(output,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(from,target);m.files.push({path,bytes:bytes.length,sha256:hash(bytes)});}
for(const p of coreDelta)for(const suffix of ['','.map'])add('backend/core/dist/src/'+p+suffix,'core/dist/src/'+p+suffix);
for(const p of adminDelta)add('apps/admin/'+p,'admin/'+p);
add('backend/core/migrations/'+migration,'migration/'+migration);
for(const [p]of files('apps/passenger/build/web'))add('apps/passenger/build/web/'+p,'passenger/'+p);
assertGuideManifest(m);writeFileSync(join(output,'guide-manifest.json'),JSON.stringify(m,null,2));
console.log(JSON.stringify({source:guideSource,baselineCore,candidateCore:m.candidateCore,files:m.files.length,driverUpdated:false,nativeUpdated:false}));

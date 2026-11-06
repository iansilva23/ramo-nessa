import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {join,relative,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {nearbySource,nearbyBase,baselineCore,candidateCore,dependencyLock,coreDelta,adminDelta,assertNearbyManifest} from '../../deploy/staging/nearby-web-contract.mjs';
const [baseArg,outputArg]=process.argv.slice(2),base=resolve(baseArg),output=resolve(outputArg),hash=b=>createHash('sha256').update(b).digest('hex');
function files(root,filter=()=>true){const rows=[];function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){const q=join(p,e.name);if(e.isSymbolicLink())throw Error('Unexpected symlink');if(e.isDirectory())walk(q);else if(e.isFile()&&filter(relative(root,q)))rows.push([relative(root,q),hash(readFileSync(q))]);}}walk(root);return rows.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);}
const before=files(join(base,'backend/core/dist/src'),p=>p.endsWith('.js')),after=files('backend/core/dist/src',p=>p.endsWith('.js')),old=new Map(before),next=new Map(after);
const delta=[...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).sort();
if(JSON.stringify(delta)!==JSON.stringify(coreDelta)||hash(JSON.stringify(before))!==baselineCore||hash(JSON.stringify(after))!==candidateCore)throw Error('Unreviewed Core delta');
if(hash(readFileSync('backend/core/package-lock.json'))!==dependencyLock)throw Error('Dependency changed');
execFileSync('git',['diff','--exit-code',nearbySource,'HEAD','--','backend','apps','packages','config/web'],{stdio:'pipe'});
if(JSON.stringify(files(join(base,'backend/core/migrations')))!==JSON.stringify(files('backend/core/migrations')))throw Error('Migration changed');
const runtimeAdmin=root=>files(root,p=>/^(index.html|styles.css|guide.css|admin-workspace.css|favicon.svg|src\/|pages\/)/.test(p));
const baselineAdmin=runtimeAdmin(join(base,'apps/admin')),candidateAdmin=runtimeAdmin('apps/admin');
if(JSON.stringify(baselineAdmin)!==JSON.stringify(candidateAdmin))throw Error('ADM changed');
mkdirSync(output);const m={format:1,source:nearbySource,baseline:nearbyBase,baselineCore,candidateCore,lock:dependencyLock,coreDelta,adminDelta,baselineAdmin,candidateAdmin,files:[]};
function add(from,path){const bytes=readFileSync(from),target=join(output,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(from,target);m.files.push({path,bytes:bytes.length,sha256:hash(bytes)});}
for(const p of coreDelta)for(const suffix of ['','.map'])add('backend/core/dist/src/'+p+suffix,'core/dist/src/'+p+suffix);
for(const [p]of files('apps/passenger/build/web'))add('apps/passenger/build/web/'+p,'passenger/'+p);
assertNearbyManifest(m);writeFileSync(join(output,'nearby-manifest.json'),JSON.stringify(m,null,2));
console.log(JSON.stringify({source:nearbySource,files:m.files.length,passengerUpdated:true,driverUpdated:false}));

// Build provenance for an isolated Core patch; never deploys or reads live env.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {resolve,relative,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
if(!/^[a-f0-9]{40}$/.test(args.source??'')||!args.baseline||!args.output)throw Error('Source, baseline and output required.');
const old=resolve(args.baseline),current=resolve('backend/core'),output=resolve(args.output);
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=root=>{
  const rows=[];
  function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isSymbolicLink())throw Error('Unexpected link');if(e.isDirectory())walk(p);else if(e.isFile()&&e.name.endsWith('.js'))rows.push([relative(root,p),hash(readFileSync(p))]);}}
  walk(root);return rows.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
};
const allowed=['places/google-places-service.js','places/google-primary-places.js','server.js'];
const before=files(join(old,'dist/src')),after=files(join(current,'dist/src'));
const previous=new Map(before),next=new Map(after);
const delta=[...new Set([...previous.keys(),...next.keys()])].filter(p=>previous.get(p)!==next.get(p)).sort();
if(JSON.stringify(delta)!==JSON.stringify(allowed))throw Error('Core compiled delta exceeds reviewed Google search files.');
const lock=readFileSync(join(current,'package-lock.json'));
if(!lock.equals(readFileSync(join(old,'package-lock.json'))))throw Error('Dependency lock changed.');
execFileSync('git',['diff','--exit-code','0f5305ddef3398112ca1e7d10a00fd05fa8548e8','HEAD','--','backend/core/migrations','backend/core/src/payments','backend/core/src/finance','backend/core/src/wallet','backend/core/src/drivers','backend/core/src/rides','backend/core/package.json','backend/core/package-lock.json'],{stdio:'pipe'});
mkdirSync(output,{recursive:false});
const manifest={format:1,source:args.source,baseline:'0f5305ddef3398112ca1e7d10a00fd05fa8548e8',
  baselineSourceSha256:hash(JSON.stringify(before)),candidateSourceSha256:hash(JSON.stringify(after)),
  packageLockSha256:hash(lock),baselineFiles:before,candidateFiles:after,financialCodePreserved:true,migrationsUnchanged:true,files:[]};
for(const path of allowed)for(const suffix of ['', '.map']){
  const name=path+suffix,raw=readFileSync(join(current,'dist/src',name)),dest=join(output,'dist/src',name);
  mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(current,'dist/src',name),dest);
  manifest.files.push({path:'dist/src/'+name,bytes:raw.length,sha256:hash(raw)});
}
writeFileSync(join(output,'core-patch-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({source:args.source,files:manifest.files.length,baselineSourceSha256:manifest.baselineSourceSha256,candidateSourceSha256:manifest.candidateSourceSha256,financialCodePreserved:true,migrationsUnchanged:true,deployed:false}));

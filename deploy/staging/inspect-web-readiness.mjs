import { spawnSync } from 'node:child_process';
import { readFileSync,statfsSync } from 'node:fs';
import { compareMigrationHistory,sha256,requireSnapshot } from './web-readiness-contract.mjs';
const repo='/opt/ramo-nessa',target='5247aabd587efa610c9b4cc36d74cbc348048b41';
if(process.getuid?.()!==0)throw new Error('Execute com sudo.');
function run(command,args,options={}){
 const result=spawnSync(command,args,{cwd:repo,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe'],...options});
 if(result.error||result.status!==0)throw new Error('Não foi possível concluir a consulta: '+command);
 return result.stdout;
}
const git=(...args)=>run('sudo',['-u','ubuntu','git','-C',repo,...args]);
const expected={
 head:'7f6086763d78f64c65d4939151d728e46f51b6fb',
 caddySha256:'5e95e7086c2a2f03c153cae8692e0cb5c210c5ee5ad598b406a0e1d1b66ce1c9',
 images:{
  'ramo-nessa-staging-core-1':'sha256:49369279cb1adc1cc6c2d6bb254471d5059ce362d0ed3badb9f08cf7598a26eb',
  'ramo-nessa-staging-gateway-1':'sha256:6163539e70c27b2ee7a785229dac754492326b73013038870ae229a8bcb4fd8e',
  'ramo-nessa-staging-postgres-1':'sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54',
  'ramo-nessa-site-institutional-site-1':'sha256:c190732d9b1cba6d6f15b8b590a1cc73dccb1c1d77640079730088de900d591e',
 }
};
const actual={head:git('rev-parse','HEAD').trim(),caddySha256:sha256(readFileSync(repo+'/deploy/staging/Caddyfile')),containers:{}};
const raw=JSON.parse(run('docker',['inspect',...Object.keys(expected.images)]));
for(const c of raw)actual.containers[c.Name.slice(1)]={image:c.Image,health:c.State.Health?.Status,composeFiles:c.Config.Labels?.['com.docker.compose.project.config_files'],mounts:c.Mounts.map(m=>({type:m.Type,name:m.Name??null,destination:m.Destination,readOnly:!m.RW}))};
requireSnapshot(actual,expected);
const files=git('ls-tree','-r','--name-only',target,'--','backend/core/migrations').trim().split('\n').filter(p=>p.endsWith('.sql'));
const candidates=new Map(files.map(path=>[path.slice(path.lastIndexOf('/')+1),sha256(Buffer.from(git('show',target+':'+path),'utf8'))]));
const sql='BEGIN READ ONLY; SELECT filename, checksum FROM schema_migrations ORDER BY filename; COMMIT;';
const rows=run('docker',['exec','ramo-nessa-staging-postgres-1','sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','web-readiness',sql]).trim().split('\n').filter(Boolean).map(line=>{const [filename,checksum]=line.split('|');return{filename,checksum};});
const migrations=compareMigrationHistory(rows,candidates);
if(migrations.pending.length!==1||migrations.pending[0].filename!=='085_web_push_preferences.sql')throw new Error('Lista de migrations pendentes diferente da revisão: nenhuma migration foi aplicada.');
const metadata=JSON.parse(run('docker',['exec','ramo-nessa-staging-core-1','node','-e',`const fs=require('node:fs');const e=process.env;let project=null;try{project=JSON.parse(e.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()||fs.readFileSync(e.FIREBASE_SERVICE_ACCOUNT_FILE,'utf8')).project_id;}catch{};function target(v){if(!v)return'padrao';try{const h=new URL(v).hostname;return h==='google-maps-mock'?'mock':h.endsWith('.googleapis.com')?'google':'outro';}catch{return'invalido';}}console.log(JSON.stringify({environment:e.NODE_ENV,otp:e.OTP_PROVIDER,push:e.PUSH_PROVIDER,paymentMode:e.MERCADO_PAGO_MODE,firebaseProject:project,routesTarget:target(e.GOOGLE_ROUTES_BASE_URL),placesTarget:target(e.GOOGLE_PLACES_BASE_URL)}));`]));
const disk=statfsSync('/opt'),freeBytes=disk.bavail*disk.bsize;
console.log(JSON.stringify({readOnly:true,candidate:target,snapshotMatches:true,worktreePreserved:true,worktreeChanges:git('status','--porcelain').trim().split('\n').filter(Boolean).length,migrations,runtime:metadata,freeDiskGiB:Math.floor(freeBytes/1024**3),containers:actual.containers},null,2));
console.log('CONSULTA CONCLUÍDA. Nenhuma migration, atualização ou reinício foi executado.');

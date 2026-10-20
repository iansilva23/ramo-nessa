// Read-only inventory. Never deploys, changes configuration, writes files or mutates SQL.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';


export const coreSourceFingerprintProgram="import {readdirSync,readFileSync,existsSync} from 'node:fs';\nimport {join,relative} from 'node:path';\nimport {createHash} from 'node:crypto';\nconst root=process.argv[1],lock=process.argv[2];\nif(!root)throw Error('Source tree required.');\nconst digest=bytes=>createHash('sha256').update(bytes).digest('hex');\nconst entries=[];\nfunction walk(dir){\n  for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){\n    const file=join(dir,item.name);\n    if(item.isSymbolicLink())throw Error('Unexpected symbolic link in source tree.');\n    if(item.isDirectory())walk(file);\n    else if(item.isFile()&&item.name.endsWith('.js'))entries.push([relative(root,file).split('\\\\').join('/'),digest(readFileSync(file))]);\n  }\n}\nwalk(root);\nif(!entries.length)throw Error('Empty source tree.');\nentries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);\nconst grouped={};\nfor(const row of entries){\n  const group=row[0]==='server.js'?'server':row[0].includes('/')?row[0].split('/')[0]:'root';\n  (grouped[group]??=[]).push(row);\n}\nconst groups=Object.fromEntries(Object.keys(grouped).sort().map(key=>[key,{files:grouped[key].length,sha256:digest(JSON.stringify(grouped[key]))}]));\nconsole.log(JSON.stringify({format:1,source:{files:entries.length,sha256:digest(JSON.stringify(entries)),groups},packageLockSha256:lock&&existsSync(lock)?digest(readFileSync(lock)):null}));";
export const gatewayFingerprintFiles=['index.html','styles.css','src/app.js','src/api.js','src/pricing-geofence-map.js'];

function inspectRuntimeFiles({run,services}){
  const core=services.find(s=>s.name==='ramo-nessa-staging-core-1');
  const gateway=services.find(s=>s.name==='ramo-nessa-staging-gateway-1');
  const result={core:null,gateway:null};
  if(core){
    const manifest=JSON.parse(run('docker',['exec',core.name,'node','--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']));
    if(manifest.format!==1||!Number.isInteger(manifest.source?.files)||!/^[a-f0-9]{64}$/.test(manifest.source?.sha256??''))
      throw Error('Assinatura do Core inválida.');
    result.core={container:core.name,imageId:core.imageId,...manifest};
  }
  if(gateway){
    const text=run('docker',['exec',gateway.name,'sha256sum',...gatewayFingerprintFiles.map(p=>'/srv/admin/'+p)]);
    const files={};
    for(const line of text.split(/\r?\n/)){
      const match=line.match(/^([a-f0-9]{64})\s+\/srv\/admin\/(.+)$/);
      if(!match||!gatewayFingerprintFiles.includes(match[2])||files[match[2]])throw Error('Assinatura do ADM inválida.');
      files[match[2]]=match[1];
    }
    if(Object.keys(files).length!==gatewayFingerprintFiles.length)throw Error('Assinatura do ADM incompleta.');
    const raw=JSON.parse(run('docker',['inspect','--format','{{json .Mounts}}',gateway.name]));
    if(!Array.isArray(raw))throw Error('Inventário de mounts inválido.');
    const mounts=raw.filter(m=>['/srv/web','/etc/caddy/Caddyfile'].includes(m.Destination))
      .map(m=>({type:m.Type,source:m.Source,destination:m.Destination,readOnly:m.RW===false}));
    result.gateway={container:gateway.name,imageId:gateway.imageId,files,mounts};
  }
  return result;
}

const projection=[
  '{{json .Name}}','{{json .Id}}','{{json .Image}}','{{json .Config.Image}}','{{json .State.Status}}',
  '{{if .State.Health}}{{json .State.Health.Status}}{{else}}"not-configured"{{end}}',
  '{{json (index .Config.Labels "org.opencontainers.image.revision")}}',
].join('\t');
const dependencyTables=['rides','payments','ledger_entries','ledger_transactions','driver_payouts','wallet_topups','wallet_topup_events','asaas_driver_transfer_attempts','asaas_driver_transfer_events'];
export function inspectRegionsPricing({execute=spawnSync,postgresContainer,includeFingerprints=false}={}){
  const run=(command,args)=>{
    const result=execute(command,args,{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
    if(result.error||result.status!==0)throw Error('Diagnóstico interrompido em '+command+'. Saída privada não exibida.');
    return result.stdout.trim();
  };
  const names=run('docker',['ps','--format','{{.Names}}']).split(/\r?\n/).filter(n=>/^ramo-nessa-[a-zA-Z0-9_.-]+$/.test(n));
  if(!names.length)throw Error('Nenhum serviço Ramo Nessa em execução foi encontrado.');
  const services=names.map(name=>{
    const fields=run('docker',['inspect','--format',projection,name]).split('\t').map(s=>JSON.parse(s));
    if(fields.length!==7)throw Error('Formato do inventário de serviços inválido.');
    const [containerName,containerId,imageId,imageTag,status,health,revision]=fields;
    return {name:containerName.replace(/^\//,''),containerId,imageId,imageTag,status,health,
      sourceRevision:typeof revision==='string'&&/^[0-9a-f]{7,40}$/.test(revision)?revision:null};
  });
  const candidates=names.filter(n=>n.includes('postgres'));
  const selected=postgresContainer??(candidates.length===1?candidates[0]:null);
  if(selected&&!candidates.includes(selected))throw Error('O PostgreSQL selecionado não pertence aos serviços Ramo Nessa em execução.');
  let checkoutRevision=null;
  try{
    const sha=run('git',['-C','/opt/ramo-nessa','rev-parse','HEAD']);
    if(/^[0-9a-f]{40}$/.test(sha))checkoutRevision=sha;
  }catch{}
  const report={format:1,generatedAt:new Date().toISOString(),readOnly:true,checkoutRevision,
    checkoutIsNotDeploymentProof:true,services,database:{status:'selection-required',candidates}};
  if(includeFingerprints)report.runtimeFiles=inspectRuntimeFiles({run,services});
  if(!selected)return report;
  const query=sql=>{
    const transaction="BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; "+sql+'; COMMIT;';
    return JSON.parse(run('docker',['exec',selected,'sh','-lc',
      'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"',
      'regions-pricing-readonly',transaction]));
  };
  const tables=query("SELECT coalesce(json_agg(table_name),'[]'::json) FROM information_schema.tables WHERE table_schema='public'");
  if(!Array.isArray(tables)||tables.some(t=>typeof t!=='string'))throw Error('Inventário de tabelas inválido.');
  const dependencies={};
  for(const table of dependencyTables)
    dependencies[table]=tables.includes(table)?query('SELECT to_json(count(*)::text) FROM public."'+table+'"'):null;
  let catalog=null;
  if(tables.includes('pricing_catalog_versions')){
    const active=query("SELECT coalesce((SELECT json_build_object('id',id,'versionNumber',version_number,'effectiveFrom',effective_from,'snapshot',snapshot) FROM public.pricing_catalog_versions WHERE status='published' AND effective_from<=now() ORDER BY effective_from DESC,version_number DESC LIMIT 1),'null'::json)");
    if(active){
      const snapshot=active.snapshot,ops=snapshot?.managedOperations;
      catalog={versionId:active.id,versionNumber:active.versionNumber,effectiveFrom:active.effectiveFrom,
        catalogVersion:snapshot?.catalogVersion??null,mode:ops?'managed':'legacy',
        snapshotSha256:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        operationalRegions:ops?ops.regions.filter(r=>r.enabled&&!r.archived).length:(snapshot?.localityGeofences?.length??null),
        activeRates:ops?ops.rates.filter(r=>r.enabled&&!r.archived).length:null};
    }
  }
  const migrations=tables.includes('schema_migrations')
    ?query("SELECT coalesce(json_agg(filename ORDER BY filename),'[]'::json) FROM public.schema_migrations"):null;
  report.database={status:'inspected',container:selected,catalog,dependencies,migrations,
    staticCatalogWhenNoPublishedVersion:catalog===null,
    inventoryIsNotBackup:true};
  if(includeFingerprints&&tables.includes('schema_migrations'))
    report.database.migrationChecksums=query("SELECT coalesce(json_agg(json_build_object('filename',filename,'checksum',checksum) ORDER BY filename),'[]'::json) FROM public.schema_migrations");
  return report;
}
export function runRegionsPricingInspection(args=process.argv.slice(2)){
  const postgres=args.filter(a=>/^--postgres-container=ramo-nessa-[a-zA-Z0-9_.-]+$/.test(a));
  const fingerprint=args.filter(a=>a==='--runtime-files');
  if(postgres.length+fingerprint.length!==args.length||postgres.length>1||fingerprint.length>1)
    throw Error('Use somente --runtime-files e/ou --postgres-container=NOME, se necessário.');
  const report=inspectRegionsPricing({postgresContainer:postgres[0]?.slice('--postgres-container='.length),includeFingerprints:fingerprint.length===1});
  const output=fingerprint.length?{format:2,generatedAt:report.generatedAt,readOnly:true,runtimeFiles:report.runtimeFiles,
    catalog:report.database.catalog??null,migrationChecksums:report.database.migrationChecksums??null,databaseStatus:report.database.status}:report;
  console.log(JSON.stringify(output,null,2));
}
if((process.argv[1]==='-'&&/\/\[eval\d+\]$/.test(import.meta.url))||(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)){
  try{runRegionsPricingInspection();}catch(error){console.error(error.message);process.exitCode=1;}
}


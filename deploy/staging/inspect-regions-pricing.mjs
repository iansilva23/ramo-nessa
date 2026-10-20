// Read-only inventory. Never deploys, changes configuration, writes files or mutates SQL.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const projection=[
  '{{json .Name}}','{{json .Id}}','{{json .Image}}','{{json .Config.Image}}','{{json .State.Status}}',
  '{{if .State.Health}}{{json .State.Health.Status}}{{else}}"not-configured"{{end}}',
  '{{json (index .Config.Labels "org.opencontainers.image.revision")}}',
].join('\t');
const dependencyTables=['rides','payments','ledger_entries','driver_payouts','passenger_wallet_ledger','driver_payout_events'];
export function inspectRegionsPricing({execute=spawnSync,postgresContainer}={}){
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
  return report;
}
export function runRegionsPricingInspection(args=process.argv.slice(2)){
  const allowed=args.filter(a=>/^--postgres-container=ramo-nessa-[a-zA-Z0-9_.-]+$/.test(a));
  if(allowed.length!==args.length||allowed.length>1)throw Error('Use somente --postgres-container=NOME, se necessário.');
  const report=inspectRegionsPricing({postgresContainer:allowed[0]?.slice('--postgres-container='.length)});
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]==='-'||(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)){
  try{runRegionsPricingInspection();}catch(error){console.error(error.message);process.exitCode=1;}
}

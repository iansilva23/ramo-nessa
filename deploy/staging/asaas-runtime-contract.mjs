// This preparation is deliberately tied to the runtime Ian inspected on 2026-10-18.
export const pricingRevision = '2ee07808d819bc73eb7377c5d273124ecd19acb0';
export const runtimeContract = {
  core: {name:'ramo-nessa-staging-core-1',image:'sha256:a9b04899a584365a3f6acb495b9a66c08f8dacacc6c640245afafb13c7e0bceb'},
  gateway: {name:'ramo-nessa-staging-gateway-1',image:'sha256:95e1df7c73c71f462d85dc07b39493955f1a9b7f4d6100f1315868a015ee8e38'},
  site: {name:'ramo-nessa-site-institutional-site-1',image:'sha256:c190732d9b1cba6d6f15b8b590a1cc73dccb1c1d77640079730088de900d591e'},
  postgres: {name:'ramo-nessa-staging-postgres-1'},
};
export const activeWeb = '/opt/ramo-nessa-web/releases/2ee07808d819/bundles';
export const activeCaddy = '/home/ubuntu/ramo-nessa-v5-3f3aad573667/deploy/staging/Caddyfile';
export function validateRuntime(snapshot) {
  for (const [key,expected] of Object.entries(runtimeContract)) {
    const actual=snapshot[key];
    if(!actual || actual.Name!=='/'+expected.name || actual.State?.Health?.Status!=='healthy' ||
       (expected.image && actual.Image!==expected.image)) throw Error('Runtime diferente ou sem saúde: '+key+'. Nenhum serviço será alterado.');
  }
  for(const [destination,source] of [['/srv/web',activeWeb],['/etc/caddy/Caddyfile',activeCaddy]]) {
    const mount=snapshot.gateway.Mounts?.find(m=>m.Destination===destination);
    if(mount?.Type!=='bind'||mount.Source!==source||mount.RW!==false) throw Error('Mount ativo diferente: '+destination);
  }
}
export function validateMigrations(applied,candidate) {
  if(!Array.isArray(applied)||!applied.length)throw Error('Histórico de migrations indisponível.');
  const seen=new Set();
  for(const row of applied){
    if(seen.has(row.filename)||candidate[row.filename]!==row.checksum) throw Error('Migration diferente: '+row.filename);
    seen.add(row.filename);
  }
  const pending=Object.keys(candidate).filter(n=>!seen.has(n)).sort();
  if(pending.length!==1||pending[0]!=='086_asaas_driver_payouts.sql')throw Error('Migrations pendentes diferentes da 086.');
  return pending;
}

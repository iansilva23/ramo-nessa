// Explicit operator tool. This file is NOT a schema migration and has no HTTP route.
// Default behavior is a read-only dependency inventory and plan export.
// Applying or restoring requires a separately reviewed plan and explicit approval.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresPricingCatalogVersionRepository} from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
import {PostgresAdminRepository} from '../src/admin/repositories/postgres-admin-repository.js';
import {PostgresAdminHumanAuthRepository} from '../src/admin/repositories/postgres-admin-human-auth-repository.js';
import {prepareCatalogResetPlan,applyCatalogResetPlan,restoreCatalogBeforeReset,type CatalogResetPlan} from '../src/pricing/catalog-reset-plan.js';
import {resolvePricingCatalogContext} from '../src/pricing/effective-catalog.js';
import {catalogRevision,RESET_ID} from '../src/pricing/management-service.js';
process.umask(0o077);
const args=process.argv.slice(2);
const value=(flag:string)=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
const apply=value('--apply-plan'),restore=value('--restore-plan'),output=value('--plan');
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw Error('DATABASE_URL deve ser configurada pelo operador; nenhum valor é impresso.');
if([apply,restore,output].filter(Boolean).length!==1)throw Error('Escolha --plan ARQUIVO, --apply-plan ARQUIVO ou --restore-plan ARQUIVO.');
const pool=createPostgresPool(databaseUrl),versions=new PostgresPricingCatalogVersionRepository(pool),admin=new PostgresAdminRepository(pool);
try{
  if(output){
    const plan=await prepareCatalogResetPlan(versions);
    const tables=['rides','payments','ledger_entries','ledger_transactions','driver_payouts','wallet_topups','wallet_topup_events','asaas_driver_transfer_attempts','asaas_driver_transfer_events'];
    const available=await pool.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])",[tables]);
    const dependencies:Record<string,string>={};
    for(const row of available.rows){
      if(!tables.includes(row.table_name))throw Error('Tabela inesperada.');
      const result=await pool.query<{count:string}>('SELECT count(*)::text AS count FROM "'+row.table_name+'"');
      dependencies[row.table_name]=result.rows[0]!.count;
    }
    const foreignKeys=await pool.query<{name:string;source_table:string;target_table:string;definition:string}>(
      `SELECT c.conname AS name,source.relname AS source_table,target.relname AS target_table,
        pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_class source ON source.oid=c.conrelid
        JOIN pg_namespace source_ns ON source_ns.oid=source.relnamespace
        JOIN pg_class target ON target.oid=c.confrelid
        JOIN pg_namespace target_ns ON target_ns.oid=target.relnamespace
        WHERE c.contype='f' AND (
          (source_ns.nspname=current_schema() AND source.relname=ANY($1::text[])) OR
          (target_ns.nspname=current_schema() AND target.relname=ANY($1::text[])))
        ORDER BY source.relname,c.conname`,[[...tables,'pricing_catalog_versions']]);
    const text=JSON.stringify({plan,dependencyInventory:dependencies,foreignKeyInventory:foreignKeys.rows,scope:'Only pricing_catalog_versions and admin_audit_log may be written. No ride, payment, payout or ledger is deleted.'},null,2)+'\n';
    const path=resolve(output);await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,text,{flag:'wx',mode:0o600});
    console.log(JSON.stringify({result:'PLAN_ONLY_NO_MUTATION',planFile:path,sha256:createHash('sha256').update(text).digest('hex'),revision:plan.sourceRevision,dependencies}));
  }else{
    const expected=apply?RESET_ID:'RESTORE_PRICING_CATALOG';
    if(value('--confirm')!==expected)throw Error('Confirmação explícita ausente. Nenhuma alteração aplicada.');
    const ownerId=process.env.ADMIN_OWNER_USER_ID?.trim()||process.env.ADMIN_PAYOUT_APPROVER_USER_ID?.trim();
    if(!ownerId)throw Error('Proprietário administrativo não configurado.');
    const humans=new PostgresAdminHumanAuthRepository(pool),owner=await humans.findUserById(ownerId);
    if(!owner||owner.status!=='active'||owner.deletedAt)throw Error('Proprietário indisponível.');
    const path=resolve((apply??restore)!);
    const bytes=await readFile(path),expectedChecksum=value('--plan-sha256');
    if(!expectedChecksum||createHash('sha256').update(bytes).digest('hex')!==expectedChecksum)throw Error('Checksum do plano ausente ou divergente.');
    const parsed=JSON.parse(bytes.toString('utf8')) as {plan:CatalogResetPlan};
    const actor={kind:'user' as const,id:owner.id,name:owner.name};
    if(apply){
      const result=await applyCatalogResetPlan({plan:parsed.plan,versions,admin,actor});
      console.log(JSON.stringify({result:result.unchanged?'ALREADY_APPLIED_NO_CHANGE':'CATALOG_PREPARED',versionId:result.record?.id}));
    }else{
      const expectedRevision=value('--expected-revision');
      if(!expectedRevision)throw Error('Informe a revisão atual explicitamente após conferir o catálogo.');
      const current=await resolvePricingCatalogContext({versions});
      if(catalogRevision(current.version)!==expectedRevision)throw Error('Revisão mudou. Restauração cancelada.');
      const result=await restoreCatalogBeforeReset({plan:parsed.plan,expectedRevision,versions,admin,actor});
      console.log(JSON.stringify({result:'PREVIOUS_CATALOG_RESTORED_AS_NEW_VERSION',versionId:result.id}));
    }
  }
}finally{await pool.end();}

// Read-only diagnostics. No environment, credentials, PINs, Pix payloads or customer names are printed.
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const inspectionSql = `
WITH subjects AS (
 SELECT DISTINCT passenger_id FROM rides
 WHERE upper(replace(id::text,'-','')) LIKE 'DEFF08F0%'
    OR upper(replace(id::text,'-','')) LIKE '3603B4F3%'
)
SELECT left(replace(r.id::text,'-',''),8) AS reference,
 md5(r.passenger_id::text) AS passenger_group,
 CASE WHEN r.driver_id IS NULL THEN NULL ELSE md5(r.driver_id::text) END AS driver_group,
 r.state,r.payment_status,r.payment_method,r.driver_consent_required,
 r.driver_hold_expires_at,r.payment_expires_at,r.created_at,r.updated_at,
 (SELECT json_build_object('method',p.method,'status',p.status,'amountCents',p.amount_cents)
  FROM payments p WHERE p.ride_id=r.id ORDER BY p.created_at DESC,p.id DESC LIMIT 1) AS payment
FROM rides r WHERE r.passenger_id IN (SELECT passenger_id FROM subjects)
ORDER BY r.updated_at DESC,r.id DESC LIMIT 30`;

export const databaseInspection = `
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const pool=createPostgresPool(process.env.DATABASE_URL);
const client=await pool.connect();
try {
 await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await client.query("SET LOCAL statement_timeout='8s'");
 const result={};
 for (const [key,table,sql] of [
  ['migrations','schema_migrations','SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 12'],
  ['boarding','ride_boarding_policy','SELECT enabled,categories,revision FROM ride_boarding_policy'],
  ['cancellation','ride_cancellation_policy','SELECT system_enabled,rules,revision FROM ride_cancellation_policy'],
  ['occurrences','ride_occurrence_policy','SELECT enabled,bonus_enabled,bonus_cents,revision FROM ride_occurrence_policy'],
  ['occurrence_counts','ride_occurrences','SELECT kind,status,count(*)::int AS count FROM ride_occurrences GROUP BY kind,status ORDER BY kind,status'],
  ['bonus_counts','ride_occurrence_penalties','SELECT status,count(*)::int AS count FROM ride_occurrence_penalties GROUP BY status ORDER BY status'],
  ['payments','payment_policy_settings','SELECT cash_enabled,pix_enabled,card_enabled,wallet_enabled FROM payment_policy_settings']
 ]) {
  if ((await client.query('SELECT to_regclass($1) AS name',[table])).rows[0].name == null) {result[key]='table_absent';continue;}
  result[key]=(await client.query(sql)).rows;
 }
 result.rides=(await client.query(${JSON.stringify(inspectionSql)})).rows;
 console.log(JSON.stringify(result,null,2));
 await client.query('ROLLBACK');
} catch {await client.query('ROLLBACK');console.error('Consulta não concluída. Nenhuma alteração realizada; detalhes privados omitidos.');process.exitCode=1;}
finally {client.release();await pool.end();}
`;

export function inspect(run = spawnSync) {
 const core='ramo-nessa-staging-core-1', gateway='ramo-nessa-staging-gateway-1';
 for (const container of [core,gateway]) {
  const state=run('docker',['inspect','--format','{{.Name}} {{.Config.Image}} {{.State.Status}}',container],{encoding:'utf8',timeout:10000});
  if(state.status!==0) throw Error('Container esperado indisponível. Nenhuma alteração realizada.');
  console.log(state.stdout.trim());
 }
 const mount=run('docker',['inspect','--format','{{range .Mounts}}{{if eq .Destination "/srv/web"}}{{.Source}}{{end}}{{end}}',gateway],{encoding:'utf8',timeout:10000});
 if(mount.status===0)console.log('Web mount:',mount.stdout.trim()||'Destino /srv/web não encontrado; conferir configuração sem alterá-la.');
 const result=run('docker',['exec','-i','--workdir','/app',core,'node','--input-type=module'],{input:databaseInspection,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 if(result.status!==0)throw Error('Consulta somente leitura não concluída. Nenhuma alteração realizada.');
 console.log(result.stdout);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{inspect();}catch(error){console.error(error.message);process.exitCode=1;}}

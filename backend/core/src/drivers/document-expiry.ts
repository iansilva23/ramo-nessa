import type {Pool} from 'pg';
export function documentDate(now:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export class DocumentExpiryNotifier {
 constructor(private pool:Pool){}
 async run(notify:(driverId:string,message:string)=>Promise<boolean>,now=new Date()){
  const today=documentDate(now);
  const rows=await this.pool.query<{id:string;driver_id:string;document_type:string;expires_on:string;stage:string}>(`SELECT id,driver_id,document_type,to_char(expires_on,'YYYY-MM-DD') expires_on,
   CASE WHEN expires_on<$1::date THEN 'expired' ELSE 'soon' END stage
   FROM driver_documents d WHERE is_current AND status='approved' AND expires_on<=$1::date+7
   AND NOT EXISTS(SELECT 1 FROM driver_document_expiry_notices n WHERE n.document_id=d.id AND n.expires_on=d.expires_on AND n.stage=CASE WHEN d.expires_on<$1::date THEN 'expired' ELSE 'soon' END)
   ORDER BY expires_on,id LIMIT 200`,[today]);
  for(const r of rows.rows){
   // A transaction lock prevents duplicate delivery by multiple Core instances.
   const c=await this.pool.connect();
   try{
    await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['document-expiry:'+r.id]);
    const inserted=await c.query('INSERT INTO driver_document_expiry_notices(document_id,expires_on,stage) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING document_id',[r.id,r.expires_on,r.stage]);
    if(inserted.rowCount){
     const label=r.document_type==='driver_license'?'CNH':'documento do veículo';
     const sent=await notify(r.driver_id,r.stage==='expired'?`Seu ${label} venceu. Envie a renovação para análise antes de receber novas corridas.`:`Seu ${label} vence em ${r.expires_on.split('-').reverse().join('/')}. Envie a renovação para análise.`);
     if(!sent)await c.query('DELETE FROM driver_document_expiry_notices WHERE document_id=$1 AND expires_on=$2 AND stage=$3',[r.id,r.expires_on,r.stage]);
    }
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
 }
}

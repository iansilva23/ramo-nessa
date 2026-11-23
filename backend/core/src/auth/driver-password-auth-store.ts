import type {Pool,PoolClient} from 'pg';
import type {AuthSessionRecord,AuthSessionRepository} from './auth-session-repository.js';
import type {AuthIdentityRepository} from './auth-identity-repository.js';
export interface DriverCredential {identityId:string;username:string;email:string;passwordHash:string;version:number;createdAt:string;updatedAt:string;}
export class DriverCredentialConflict extends Error {}
export interface DriverPasswordAuthStore {
 findByIdentifier(value:string):Promise<DriverCredential|null>;
 findByIdentity(id:string):Promise<DriverCredential|null>;
 enroll(c:DriverCredential):Promise<boolean>;
 saveLoginSession(c:DriverCredential,s:AuthSessionRecord,sessions:AuthSessionRepository):Promise<boolean>;
}
export class InMemoryDriverPasswordAuthStore implements DriverPasswordAuthStore {
 private readonly credentials=new Map<string,DriverCredential>();
 constructor(private readonly identities:AuthIdentityRepository){}
 async findByIdentifier(value:string){return structuredClone([...this.credentials.values()].find(c=>c.username===value||c.email===value)??null);}
 async findByIdentity(id:string){return structuredClone(this.credentials.get(id)??null);}
 async enroll(c:DriverCredential){
  const i=await this.identities.findIdentityById(c.identityId);
  if(i?.subjectType!=='driver'||i.status!=='active'||this.credentials.has(c.identityId))return false;
  if([...this.credentials.values()].some(v=>v.username===c.username||v.email===c.email))throw new DriverCredentialConflict();
  this.credentials.set(c.identityId,structuredClone(c));return true;
 }
 async saveLoginSession(c:DriverCredential,s:AuthSessionRecord,sessions:AuthSessionRepository){
  const i=await this.identities.findIdentityById(c.identityId);
  if(i?.subjectType!=='driver'||i.status!=='active'||i.subjectId!==s.subjectId||this.credentials.get(c.identityId)?.version!==c.version)return false;
  await sessions.create(s);return true;
 }

}
type CRow={identity_id:string;username_normalized:string;email_normalized:string;password_hash:string;version:number;created_at:Date;updated_at:Date};
function credential(r?:CRow):DriverCredential|null{return r?{identityId:r.identity_id,username:r.username_normalized,email:r.email_normalized,passwordHash:r.password_hash,version:r.version,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()}:null;}
async function insertSession(client:PoolClient,s:AuthSessionRecord){await client.query(`INSERT INTO auth_sessions(id,subject_id,subject_type,token_hash,expires_at,revoked_at,created_at) VALUES($1,$2,$3,$4,$5,NULL,$6)`,[s.id,s.subjectId,s.subjectType,s.tokenHash,s.expiresAt,s.createdAt]);}
export class PostgresDriverPasswordAuthStore implements DriverPasswordAuthStore {
 constructor(private readonly pool:Pool){}
 async findByIdentifier(v:string){return credential((await this.pool.query<CRow>('SELECT * FROM driver_login_credentials WHERE username_normalized=$1 OR email_normalized=$1',[v])).rows[0]);}
 async findByIdentity(id:string){return credential((await this.pool.query<CRow>('SELECT * FROM driver_login_credentials WHERE identity_id=$1',[id])).rows[0]);}
 async enroll(c:DriverCredential){
  const client=await this.pool.connect();try{
   await client.query('BEGIN');
   const i=await client.query("SELECT id FROM auth_identities WHERE id=$1 AND subject_type='driver' AND status='active' FOR UPDATE",[c.identityId]);
   if(!i.rowCount){await client.query('ROLLBACK');return false;}
   const result=await client.query(`INSERT INTO driver_login_credentials(identity_id,username_normalized,email_normalized,password_hash,version,created_at,updated_at) VALUES($1,$2,$3,$4,1,$5,$6) ON CONFLICT(identity_id) DO NOTHING RETURNING identity_id`,[c.identityId,c.username,c.email,c.passwordHash,c.createdAt,c.updatedAt]);
   if(!result.rowCount){await client.query('ROLLBACK');return false;}
   await client.query("UPDATE auth_identities SET email_normalized=$2,updated_at=$3 WHERE id=$1 AND subject_type='driver'",[c.identityId,c.email,c.updatedAt]);
   await client.query('COMMIT');return true;
  }catch(error){await client.query('ROLLBACK');if((error as {code?:string}).code==='23505')throw new DriverCredentialConflict();throw error;}finally{client.release();}
 }
 async saveLoginSession(c:DriverCredential,s:AuthSessionRecord,_sessions:AuthSessionRepository){
  const client=await this.pool.connect();try{
   await client.query('BEGIN');
   const i=await client.query("SELECT subject_id FROM auth_identities WHERE id=$1 AND subject_type='driver' AND status='active' FOR UPDATE",[c.identityId]);
   const row=await client.query('SELECT version FROM driver_login_credentials WHERE identity_id=$1 FOR UPDATE',[c.identityId]);
   if(!i.rowCount||i.rows[0].subject_id!==s.subjectId||row.rows[0]?.version!==c.version){await client.query('ROLLBACK');return false;}
   await insertSession(client,s);await client.query('COMMIT');return true;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }

}

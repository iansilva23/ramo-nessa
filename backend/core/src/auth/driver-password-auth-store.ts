import type {Pool,PoolClient} from 'pg';
import type {AuthSessionRecord,AuthSessionRepository} from './auth-session-repository.js';
import type {AuthOtpRepository} from './auth-otp-repository.js';
export interface DriverCredential {identityId:string;username:string;email:string;passwordHash:string;version:number;createdAt:string;updatedAt:string;}
export interface DriverResetRequest {challengeId:string;identityId:string;credentialVersion:number;expiresAt:string;createdAt:string;consumedAt?:string;}
export class DriverCredentialConflict extends Error {}
export interface DriverPasswordAuthStore {
 findByIdentifier(value:string):Promise<DriverCredential|null>;
 findByIdentity(id:string):Promise<DriverCredential|null>;
 enroll(c:DriverCredential):Promise<boolean>;
 saveResetRequest(r:DriverResetRequest):Promise<void>;
 findResetRequest(id:string):Promise<DriverResetRequest|null>;
 saveLoginSession(c:DriverCredential,s:AuthSessionRecord,sessions:AuthSessionRepository):Promise<boolean>;
 completeReset(r:DriverResetRequest,passwordHash:string,s:AuthSessionRecord,sessions:AuthSessionRepository,now:string):Promise<boolean>;
}
export class InMemoryDriverPasswordAuthStore implements DriverPasswordAuthStore {
 private readonly credentials=new Map<string,DriverCredential>();
 private readonly resets=new Map<string,DriverResetRequest>();
 constructor(private readonly identities:AuthOtpRepository){}
 async findByIdentifier(value:string){return structuredClone([...this.credentials.values()].find(c=>c.username===value||c.email===value)??null);}
 async findByIdentity(id:string){return structuredClone(this.credentials.get(id)??null);}
 async enroll(c:DriverCredential){
  const i=await this.identities.findIdentityById(c.identityId);
  if(i?.subjectType!=='driver'||i.status!=='active'||this.credentials.has(c.identityId))return false;
  if([...this.credentials.values()].some(v=>v.username===c.username||v.email===c.email))throw new DriverCredentialConflict();
  this.credentials.set(c.identityId,structuredClone(c));return true;
 }
 async saveResetRequest(r:DriverResetRequest){this.resets.set(r.challengeId,structuredClone(r));}
 async findResetRequest(id:string){return structuredClone(this.resets.get(id)??null);}
 async saveLoginSession(c:DriverCredential,s:AuthSessionRecord,sessions:AuthSessionRepository){
  const i=await this.identities.findIdentityById(c.identityId);
  if(i?.subjectType!=='driver'||i.status!=='active'||i.subjectId!==s.subjectId||this.credentials.get(c.identityId)?.version!==c.version)return false;
  await sessions.create(s);return true;
 }
 async completeReset(r:DriverResetRequest,passwordHash:string,s:AuthSessionRecord,sessions:AuthSessionRepository,now:string){
  const i=await this.identities.findIdentityById(r.identityId),saved=this.resets.get(r.challengeId),c=this.credentials.get(r.identityId);
  if(i?.subjectType!=='driver'||i.status!=='active'||i.subjectId!==s.subjectId||!saved||saved.consumedAt||Date.parse(saved.expiresAt)<=Date.parse(now)||c?.version!==r.credentialVersion)return false;
  this.resets.set(r.challengeId,{...saved,consumedAt:now});
  this.credentials.set(r.identityId,{...c,passwordHash,version:c.version+1,updatedAt:now});
  await sessions.revokeAllForSubject('driver',i.subjectId,now);await sessions.create(s);return true;
 }
}
type CRow={identity_id:string;username_normalized:string;email_normalized:string;password_hash:string;version:number;created_at:Date;updated_at:Date};
type RRow={challenge_id:string;identity_id:string;credential_version:number;expires_at:Date;created_at:Date;consumed_at:Date|null};
function credential(r?:CRow):DriverCredential|null{return r?{identityId:r.identity_id,username:r.username_normalized,email:r.email_normalized,passwordHash:r.password_hash,version:r.version,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()}:null;}
function reset(r?:RRow):DriverResetRequest|null{return r?{challengeId:r.challenge_id,identityId:r.identity_id,credentialVersion:r.credential_version,expiresAt:r.expires_at.toISOString(),createdAt:r.created_at.toISOString(),...(r.consumed_at?{consumedAt:r.consumed_at.toISOString()}:{})}:null;}
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
 async saveResetRequest(r:DriverResetRequest){await this.pool.query('INSERT INTO driver_password_reset_requests(challenge_id,identity_id,credential_version,expires_at,created_at) VALUES($1,$2,$3,$4,$5)',[r.challengeId,r.identityId,r.credentialVersion,r.expiresAt,r.createdAt]);}
 async findResetRequest(id:string){return reset((await this.pool.query<RRow>('SELECT * FROM driver_password_reset_requests WHERE challenge_id=$1',[id])).rows[0]);}
 async saveLoginSession(c:DriverCredential,s:AuthSessionRecord,_sessions:AuthSessionRepository){
  const client=await this.pool.connect();try{
   await client.query('BEGIN');
   const i=await client.query("SELECT subject_id FROM auth_identities WHERE id=$1 AND subject_type='driver' AND status='active' FOR UPDATE",[c.identityId]);
   const row=await client.query('SELECT version FROM driver_login_credentials WHERE identity_id=$1 FOR UPDATE',[c.identityId]);
   if(!i.rowCount||i.rows[0].subject_id!==s.subjectId||row.rows[0]?.version!==c.version){await client.query('ROLLBACK');return false;}
   await insertSession(client,s);await client.query('COMMIT');return true;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async completeReset(r:DriverResetRequest,passwordHash:string,s:AuthSessionRecord,_sessions:AuthSessionRepository,now:string){
  const client=await this.pool.connect();try{
   await client.query('BEGIN');
   const i=await client.query("SELECT subject_id FROM auth_identities WHERE id=$1 AND subject_type='driver' AND status='active' FOR UPDATE",[r.identityId]);
   const c=await client.query('SELECT version FROM driver_login_credentials WHERE identity_id=$1 FOR UPDATE',[r.identityId]);
   const saved=(await client.query<RRow>('SELECT * FROM driver_password_reset_requests WHERE challenge_id=$1 FOR UPDATE',[r.challengeId])).rows[0];
   if(!i.rowCount||i.rows[0].subject_id!==s.subjectId||c.rows[0]?.version!==r.credentialVersion||!saved||saved.identity_id!==r.identityId||saved.credential_version!==r.credentialVersion||saved.consumed_at||saved.expires_at.getTime()<=Date.parse(now)){await client.query('ROLLBACK');return false;}
   await client.query('UPDATE driver_login_credentials SET password_hash=$2,version=version+1,updated_at=$3 WHERE identity_id=$1',[r.identityId,passwordHash,now]);
   await client.query('UPDATE driver_password_reset_requests SET consumed_at=$2 WHERE identity_id=$1 AND consumed_at IS NULL',[r.identityId,now]);
   await client.query("UPDATE auth_sessions SET revoked_at=$2 WHERE subject_type='driver' AND subject_id=$1 AND revoked_at IS NULL",[s.subjectId,now]);
   await insertSession(client,s);await client.query('COMMIT');return true;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
}

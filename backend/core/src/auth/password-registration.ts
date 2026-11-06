import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {AuthIdentityRecord,AuthIdentityRepository} from './auth-identity-repository.js';
import type {AuthSessionRepository} from './auth-session-repository.js';
import {InMemoryAuthIdentityRepository} from './repositories/in-memory-auth-identity-repository.js';
import type {DriverPasswordAuthStore} from './driver-password-auth-store.js';
import {normalizeDriverUsername} from './driver-password-auth-service.js';
import {normalizeBrazilMobilePhone} from './auth-input.js';
import {normalizePassengerEmail,normalizePassengerName,hashPassengerPassword,consumePasswordLoginLimits} from './passenger-password-auth-service.js';
import {issueAuthSession} from './auth-service.js';
export class PasswordRegistrationError extends Error {
 constructor(readonly code:'ACCOUNT_ALREADY_EXISTS'|'REGISTRATION_RATE_LIMITED',message:string,readonly retryAfterSeconds?:number){super(message);}
}
function conflict():never{throw new PasswordRegistrationError('ACCOUNT_ALREADY_EXISTS','Não foi possível criar a conta com esses dados. Se já possui uma conta, entre com sua senha.');}
export interface PasswordRegistrationStore {create(identity:AuthIdentityRecord,username?:string):Promise<void>;}
export class PostgresPasswordRegistrationStore implements PasswordRegistrationStore {
 constructor(private readonly pool:Pool){}
 async create(i:AuthIdentityRecord,username?:string){
  const c=await this.pool.connect();try{
   await c.query('BEGIN');
   // INSERT only: a submitted contact number can never claim an existing identity.
   await c.query(`INSERT INTO auth_identities(id,subject_id,subject_type,phone_e164,email_normalized,full_name,password_hash,status,driver_registration_only,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$9)`,[i.id,i.subjectId,i.subjectType,i.phoneE164,i.emailNormalized,i.fullName,i.subjectType==='passenger'?i.passwordHash:null,i.subjectType==='driver',i.createdAt]);
   if(i.subjectType==='driver')await c.query(`INSERT INTO driver_login_credentials(identity_id,username_normalized,email_normalized,password_hash,version,created_at,updated_at) VALUES($1,$2,$3,$4,1,$5,$5)`,[i.id,username,i.emailNormalized,i.passwordHash,i.createdAt]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');if((e as {code?:string}).code==='23505')conflict();throw e;}finally{c.release();}
 }
}
export class MemoryPasswordRegistrationStore implements PasswordRegistrationStore {
 private queue:Promise<void>=Promise.resolve();
 constructor(private readonly identities:InMemoryAuthIdentityRepository,private readonly drivers:DriverPasswordAuthStore){}
 async create(i:AuthIdentityRecord,username?:string){
  const task=this.queue.then(async()=>{
   if(await this.identities.findIdentityByPhone(i.subjectType,i.phoneE164)||await this.identities.findIdentityByEmail(i.subjectType,i.emailNormalized!))conflict();
   if(username&&(await this.drivers.findByIdentifier(username)||await this.drivers.findByIdentifier(i.emailNormalized!)))conflict();
   await this.identities.createIdentity(i);
   try{if(i.subjectType==='driver'&&!await this.drivers.enroll({identityId:i.id,username:username!,email:i.emailNormalized!,passwordHash:i.passwordHash!,version:1,createdAt:i.createdAt,updatedAt:i.updatedAt}))conflict();}
   catch(e){this.identities.removeNewIdentity(i.id);throw e;}
  });
  this.queue=task.catch(()=>{});await task;
 }
}
export async function registerPasswordAccount(d:{identities:AuthIdentityRepository;sessions:AuthSessionRepository;store:PasswordRegistrationStore;rateLimitSecret:string},input:{role:'driver'|'passenger';phone:string;email:string;fullName:string;username?:string;password:string;clientIp?:string|undefined;clientInstanceId?:string|undefined;now?:Date}){
 const now=input.now??new Date(),phone=normalizeBrazilMobilePhone(input.phone),email=normalizePassengerEmail(input.email),fullName=normalizePassengerName(input.fullName),username=input.role==='driver'?normalizeDriverUsername(input.username??''):undefined;
 const rate=await consumePasswordLoginLimits({identities:d.identities,account:phone,rateLimitSecret:d.rateLimitSecret,namespace:'password-registration-'+input.role,now,...(input.clientIp?{clientIp:input.clientIp}:{}),...(input.clientInstanceId?{clientInstanceId:input.clientInstanceId}:{})});
 if(!rate.allowed)throw new PasswordRegistrationError('REGISTRATION_RATE_LIMITED','Muitas tentativas de cadastro. Aguarde e tente novamente.',Math.max(1,Math.ceil(rate.retryAfterMs/1000)));
 if(await d.identities.findIdentityByPhone(input.role,phone)||await d.identities.findIdentityByEmail(input.role,email))conflict();
 const identity:AuthIdentityRecord={id:randomUUID(),subjectId:input.role+'-'+randomUUID(),subjectType:input.role,phoneE164:phone,emailNormalized:email,fullName,passwordHash:await hashPassengerPassword(input.password),status:'active',...(input.role==='driver'?{driverRegistrationOnly:true}:{}),createdAt:now.toISOString(),updatedAt:now.toISOString()};
 await d.store.create(identity,username);
 const issued=await issueAuthSession({repository:d.sessions,subjectId:identity.subjectId,subjectType:input.role,now});
 return {accessToken:issued.token,tokenType:'Bearer' as const,subjectId:identity.subjectId,subjectType:input.role,expiresAt:issued.session.expiresAt};
}

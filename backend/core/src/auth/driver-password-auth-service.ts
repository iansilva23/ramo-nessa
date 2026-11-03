import {randomUUID} from 'node:crypto';
import type {AuthOtpRepository,AuthIdentityRecord} from './auth-otp-repository.js';
import type {AuthSessionRepository,AuthSessionRecord} from './auth-session-repository.js';
import type {OtpDeliveryProvider} from './otp-delivery-provider.js';
import {issueAuthSession} from './auth-service.js';
import {requestPhoneOtp,verifyPhoneOtp,PhoneOtpError,type OtpRequestContext} from './phone-otp-service.js';
import {hashPassengerPassword,verifyPassengerPassword,normalizePassengerEmail,consumePasswordLoginLimits} from './passenger-password-auth-service.js';
import {DriverCredentialConflict,type DriverPasswordAuthStore,type DriverCredential} from './driver-password-auth-store.js';
export class DriverPasswordAuthError extends Error {
 constructor(public readonly code:'DRIVER_LOGIN_INVALID'|'DRIVER_LOGIN_RATE_LIMITED'|'DRIVER_CREDENTIALS_INVALID'|'DRIVER_CREDENTIALS_CONFLICT'|'DRIVER_CREDENTIALS_ALREADY_SET'|'DRIVER_RESET_INVALID',message:string,public readonly retryAfterSeconds?:number){super(message);this.name='DriverPasswordAuthError';}
}
export interface DriverPasswordDependencies {identities:AuthOtpRepository;sessions:AuthSessionRepository;store:DriverPasswordAuthStore;rateLimitSecret:string;}
export function normalizeDriverUsername(value:string):string {
 const username=value.trim().toLowerCase();
 if(!/^[a-z][a-z0-9._-]{2,31}$/.test(username))throw new DriverPasswordAuthError('DRIVER_CREDENTIALS_INVALID','O usuário deve ter de 3 a 32 caracteres, começar com letra e usar letras, números, ponto, hífen ou sublinhado.');return username;
}
export function normalizeDriverIdentifier(value:string):string{return value.trim().length>254?'':value.trim().toLowerCase();}
async function limit(d:DriverPasswordDependencies,account:string,context:OtpRequestContext|undefined,now:Date,scope='login'){
 const result=await consumePasswordLoginLimits({identities:d.identities,account,rateLimitSecret:d.rateLimitSecret,
  namespace:'driver-password-'+scope,now,...(context?.clientIp?{clientIp:context.clientIp}:{}),
  ...(context?.clientInstanceId?{clientInstanceId:context.clientInstanceId}:{})});
 if(!result.allowed)throw new DriverPasswordAuthError('DRIVER_LOGIN_RATE_LIMITED','Muitas tentativas. Aguarde e tente novamente.',Math.max(1,Math.ceil(result.retryAfterMs/1000)));
}
function invalid():never{throw new DriverPasswordAuthError('DRIVER_LOGIN_INVALID','Usuário, e-mail ou senha inválidos.');}
async function active(d:DriverPasswordDependencies,c:DriverCredential|null):Promise<AuthIdentityRecord|null>{const i=c?await d.identities.findIdentityById(c.identityId):null;return i?.subjectType==='driver'&&i.status==='active'?i:null;}
function capture(s:AuthSessionRepository,create:(record:AuthSessionRecord)=>Promise<AuthSessionRecord>):AuthSessionRepository{const value=Object.create(s) as AuthSessionRepository;value.create=create;return value;}
export async function loginDriverWithPassword(d:DriverPasswordDependencies,input:{identifier:string;password:string;context?:OtpRequestContext;now?:Date}){
 const now=input.now??new Date(),id=normalizeDriverIdentifier(input.identifier),c=await d.store.findByIdentifier(id);
 await limit(d,c?.identityId??id,input.context,now);
 const dummy='scrypt-passenger-v1$'+Buffer.alloc(16,7).toString('base64url')+'$'+Buffer.alloc(64,0).toString('base64url');
 const valid=await verifyPassengerPassword(input.password,c?.passwordHash??dummy),i=await active(d,c);
 if(!c||!i||!valid)invalid();
 const issued=await issueAuthSession({repository:capture(d.sessions,async s=>{if(!await d.store.saveLoginSession(c,s,d.sessions))invalid();return s;}),subjectId:i.subjectId,subjectType:'driver',now});
 return {accessToken:issued.token,tokenType:'Bearer' as const,subjectId:i.subjectId,subjectType:'driver' as const,expiresAt:issued.session.expiresAt};
}
export async function enrollDriverPassword(d:DriverPasswordDependencies,input:{subjectId:string;username:string;email:string;password:string;now?:Date}){
 const i=await d.identities.findIdentityBySubject('driver',input.subjectId);if(!i||i.status!=='active')invalid();
 const username=normalizeDriverUsername(input.username),email=normalizePassengerEmail(input.email),passwordHash=await hashPassengerPassword(input.password),now=(input.now??new Date()).toISOString();
 try{if(!await d.store.enroll({identityId:i.id,username,email,passwordHash,version:1,createdAt:now,updatedAt:now}))throw new DriverPasswordAuthError('DRIVER_CREDENTIALS_ALREADY_SET','Este acesso já foi configurado. Use sua senha ou a recuperação pelo WhatsApp.');}
 catch(error){if(error instanceof DriverCredentialConflict)throw new DriverPasswordAuthError('DRIVER_CREDENTIALS_CONFLICT','Este usuário ou e-mail já está em uso. Escolha outro.');throw error;}
 return {configured:true,username,email};
}
export async function requestDriverPasswordReset(d:DriverPasswordDependencies,input:{identifier:string;delivery:OtpDeliveryProvider|null;context?:OtpRequestContext;now?:Date}){
 const now=input.now??new Date(),identifier=normalizeDriverIdentifier(input.identifier),c=await d.store.findByIdentifier(identifier),i=await active(d,c);
 if(process.env.WHATSAPP_OTP_ABUSE_CONTROLS!=='disabled')await limit(d,c?.identityId??identifier,input.context,now,'recovery');
 if(!c||!i)return {challengeId:randomUUID(),expiresAt:new Date(now.getTime()+300000).toISOString(),retryAfterSeconds:process.env.WHATSAPP_OTP_ABUSE_CONTROLS==='disabled'?0:60};
 const result=await requestPhoneOtp({repository:d.identities,delivery:input.delivery,subjectType:'driver',phone:i.phoneE164,allowDriverRegistration:false,allowPassengerCreate:false,...(input.context?{context:input.context}:{}),now});
 await d.store.saveResetRequest({challengeId:result.challengeId,identityId:i.id,credentialVersion:c.version,expiresAt:result.expiresAt,createdAt:now.toISOString()});return result;
}
export async function completeDriverPasswordReset(d:DriverPasswordDependencies,input:{challengeId:string;code:string;password:string;delivery:OtpDeliveryProvider|null;now?:Date}){
 const started=Date.now(),now=input.now??new Date();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.challengeId))throw new DriverPasswordAuthError('DRIVER_RESET_INVALID','Código inválido ou expirado.');
 const r=await d.store.findResetRequest(input.challengeId),c=r?await d.store.findByIdentity(r.identityId):null,i=await active(d,c),challenge=r?await d.identities.findChallengeById(input.challengeId):null;
 if(!r||!c||!i||r.consumedAt||Date.parse(r.expiresAt)<=now.getTime()||r.credentialVersion!==c.version||challenge?.identityId!==i.id)throw new DriverPasswordAuthError('DRIVER_RESET_INVALID','Código inválido ou expirado.');
 const passwordHash=await hashPassengerPassword(input.password);let session:AuthSessionRecord|undefined;
 const verified=await verifyPhoneOtp({repository:d.identities,sessions:capture(d.sessions,async value=>{session=value;return value;}),delivery:input.delivery,challengeId:input.challengeId,code:input.code,now});
 if(verified.subjectType!=='driver'||verified.subjectId!==i.subjectId||!session)throw new PhoneOtpError('OTP_INVALID_OR_EXPIRED','Código inválido ou expirado.');
 const completedAt=new Date(now.getTime()+Math.max(0,Date.now()-started)).toISOString();
 if(!await d.store.completeReset(r,passwordHash,session,d.sessions,completedAt))throw new DriverPasswordAuthError('DRIVER_RESET_INVALID','Código inválido ou expirado.');return verified;
}

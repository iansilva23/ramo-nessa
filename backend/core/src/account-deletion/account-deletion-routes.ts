import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthSubjectType } from '../auth/auth-session-repository.js';
import type { DeletablePrivateDocumentStorage } from '../drivers/driver-document-private-storage.js';
import { AccountDeletionError, type SelfAccountDeletion } from './self-account-deletion.js';
import { accountDeletionPage,accountDeletionScript } from './account-deletion-page.js';
export async function accountDeletionRoutes(d:{request:IncomingMessage;response:ServerResponse;url:URL;enabled:boolean;service:SelfAccountDeletion|null;storage:DeletablePrivateDocumentStorage|null;cardScope?:string|undefined;authenticate:()=>Promise<{subjectType:AuthSubjectType;subjectId:string}>;readJson:(request:IncomingMessage)=>Promise<unknown>;json:(response:ServerResponse,status:number,body:unknown)=>void;disconnect:(id:string)=>void;process:()=>Promise<void>}) {
 const {request,response,url}=d;
 if(!['/v1/me/account-deletion','/v1/account-deletion/status','/v1/account-deletion/page','/v1/account-deletion/app.js'].includes(url.pathname))return false;
 response.setHeader('cache-control','no-store');response.setHeader('referrer-policy','no-referrer');
 try{
  if(request.method==='GET'&&(url.pathname.endsWith('/page')||url.pathname.endsWith('/app.js'))){
   const script=url.pathname.endsWith('/app.js');
   response.setHeader('content-type',script?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
   response.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");response.end(script?accountDeletionScript:accountDeletionPage);return true;
  }
  if(!d.enabled||!d.service){d.json(response,request.method==='GET'?200:503,{available:false,message:'Exclusão automática ainda em preparação.'});return true;}
  if(request.method==='POST'&&url.pathname==='/v1/account-deletion/status'){
   const body=await d.readJson(request) as {receipt?:unknown}|null;d.json(response,200,await d.service.receiptStatus(body?.receipt));return true;
  }
  if(url.pathname!=='/v1/me/account-deletion'){d.json(response,405,{error:'METHOD_NOT_ALLOWED'});return true;}
  const subject=await d.authenticate();
  if(request.method==='GET'){d.json(response,200,await d.service.overview(subject.subjectType,subject.subjectId));return true;}
  if(request.method==='POST'){
   const body=await d.readJson(request) as {confirmed?:unknown}|null;
   const result=await d.service.start(subject.subjectType,subject.subjectId,body?.confirmed,Boolean(d.storage),d.cardScope);
   for(const session of result.sessions)d.disconnect(session);
   // The durable job is committed already. A cleanup failure must not lose the receipt.
   try{void d.process().catch(()=>{});}catch{}
   const current=await d.service.receiptStatus(result.receipt).catch(()=>({status:'processing'}));
   d.json(response,202,{id:result.id,receipt:result.receipt,status:current.status});return true;
  }
  d.json(response,405,{error:'METHOD_NOT_ALLOWED'});return true;
 }catch(error){if(error instanceof AccountDeletionError){d.json(response,error.status,{error:error.code,message:error.message});return true;}throw error;}
}

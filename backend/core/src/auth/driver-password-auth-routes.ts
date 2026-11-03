import type {IncomingMessage,ServerResponse} from 'node:http';
import {authenticateBearer} from './auth-service.js';
import {browserAuthResponse} from './browser-session-transport.js';
import type {OtpDeliveryProvider} from './otp-delivery-provider.js';
import {DriverPasswordAuthError,loginDriverWithPassword,enrollDriverPassword,requestDriverPasswordReset,completeDriverPasswordReset,type DriverPasswordDependencies} from './driver-password-auth-service.js';
export async function handleDriverPasswordAuthRoute(input:{
 request:IncomingMessage;response:ServerResponse;pathname:string;dependencies:DriverPasswordDependencies;
 delivery:OtpDeliveryProvider|null;readJson:(request:IncomingMessage)=>Promise<unknown>;
 json:(response:ServerResponse,status:number,body:unknown)=>void;
 clientIp:string|undefined;clientInstanceId:string|undefined;
}):Promise<boolean>{
 const {request,response,pathname,dependencies:d}=input;
 const known=['/v1/auth/driver/password/login','/v1/auth/driver/password/reset/request','/v1/auth/driver/password/reset/complete','/v1/driver/me/login-credentials'];
 if(!known.includes(pathname))return false;
 if((pathname==='/v1/driver/me/login-credentials'&&!['GET','POST'].includes(request.method??''))||
    (pathname!=='/v1/driver/me/login-credentials'&&request.method!=='POST')){input.json(response,405,{error:'METHOD_NOT_ALLOWED'});return true;}
 response.setHeader('cache-control','no-store');
 const context={...(input.clientIp?{clientIp:input.clientIp}:{}),...(input.clientInstanceId?{clientInstanceId:input.clientInstanceId}:{})};
 try{
  if(pathname==='/v1/driver/me/login-credentials'){
   const session=await authenticateBearer({repository:d.sessions,identities:d.identities,headers:request.headers,requiredType:'driver',allowDriverRegistration:true});
   if(request.method==='GET'){
    const identity=await d.identities.findIdentityBySubject('driver',session.subjectId);
    const credential=identity?await d.store.findByIdentity(identity.id):null;
    input.json(response,200,credential?{configured:true,username:credential.username,email:credential.email}:{configured:false});return true;
   }
   const body=await input.readJson(request),value=object(body);
   input.json(response,201,await enrollDriverPassword(d,{subjectId:session.subjectId,username:text(value.username),email:text(value.email),password:text(value.password)}));return true;
  }
  const value=object(await input.readJson(request));
  if(pathname.endsWith('/password/login')){
   const result=await loginDriverWithPassword(d,{identifier:text(value.identifier),password:text(value.password),context});
   input.json(response,201,browserAuthResponse(request,response,result));
  }else if(pathname.endsWith('/reset/request')){
   input.json(response,202,await requestDriverPasswordReset(d,{identifier:text(value.identifier),delivery:input.delivery,context}));
  }else{
   const result=await completeDriverPasswordReset(d,{challengeId:text(value.challengeId),code:text(value.code),password:text(value.password),delivery:input.delivery});
   input.json(response,201,browserAuthResponse(request,response,result));
  }
 }catch(error){
  if(!(error instanceof DriverPasswordAuthError))throw error;
  const status=error.code==='DRIVER_LOGIN_RATE_LIMITED'?429:
   error.code==='DRIVER_LOGIN_INVALID'||error.code==='DRIVER_RESET_INVALID'?401:
   error.code==='DRIVER_CREDENTIALS_CONFLICT'||error.code==='DRIVER_CREDENTIALS_ALREADY_SET'?409:422;
  if(error.retryAfterSeconds!=null)response.setHeader('retry-after',String(error.retryAfterSeconds));
  input.json(response,status,{error:error.code,message:error.message,...(error.retryAfterSeconds==null?{}:{retryAfterSeconds:error.retryAfterSeconds})});
 }
 return true;
}
function object(value:unknown):Record<string,unknown>{return value!=null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function text(value:unknown):string{return typeof value==='string'?value:'';}

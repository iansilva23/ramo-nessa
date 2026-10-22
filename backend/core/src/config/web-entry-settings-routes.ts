import type {IncomingMessage,ServerResponse} from 'node:http';
import type {AdminRepository} from '../admin/admin-repository.js';
import type {AdminHumanAuthRepository} from '../admin/admin-human-auth-repository.js';
import {authenticateAdminPrincipal} from '../admin/admin-authorization.js';
import {parseWebEntryUpdate,type WebEntrySettingsRepository} from './web-entry-settings.js';
export async function webEntrySettingsRoutes(input:{request:IncomingMessage;response:ServerResponse;url:URL;repository:WebEntrySettingsRepository;admin:AdminRepository;humans:AdminHumanAuthRepository;readJson:(request:IncomingMessage)=>Promise<unknown>;json:(response:ServerResponse,status:number,body:unknown)=>void}):Promise<boolean>{
  const {request,response,url,repository,admin,humans,readJson,json}=input;
  if(request.method==='GET'&&url.pathname==='/v1/public/web-entry-settings'){
    response.setHeader('Cache-Control','no-store');
    const value=await repository.get();json(response,200,{enabled:value.enabled});return true;
  }
  if(url.pathname!=='/v1/admin/web-entry-settings'||!['GET','PATCH'].includes(request.method??''))return false;
  response.setHeader('Cache-Control','no-store');
  const actor=await authenticateAdminPrincipal({apiKeys:admin,humanAuth:humans,headers:request.headers,requiredScope:request.method==='PATCH'?'communications:write':'communications:read'});
  const value=request.method==='PATCH'?await repository.save({...parseWebEntryUpdate(await readJson(request)),actor}):await repository.get();
  json(response,200,value);return true;
}

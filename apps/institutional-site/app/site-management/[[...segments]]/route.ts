import { z } from 'zod';
import { authorizeSite, SITE_SCOPES } from '@/lib/site-auth';
import { contentSchema, leadSchema, SiteError } from '@/lib/site-content';
import { siteManagement } from '@/db/site-management';
import { interestStore } from '@/db/interests';
import { receiveAsset } from '@/lib/site-files';
import { readInterestBody } from '@/lib/interest-request';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
async function handle(request:Request){
  try{
    const url=new URL(request.url);const path=url.pathname.replace(/^\/site-management\/?/,'');
    const lead=path==='leads'||/^leads\/[0-9a-f-]{36}$/.test(path);
    const scope=lead?(request.method==='GET'?SITE_SCOPES.leadsRead:SITE_SCOPES.leadsWrite):(request.method==='GET'?SITE_SCOPES.contentRead:SITE_SCOPES.contentWrite);
    const actor=await authorizeSite(request,scope);
    interestStore().check();const store=siteManagement();
    if(request.method==='GET'&&path==='leads'){
      const status=z.enum(['','new','contacted','approved','closed']).parse(url.searchParams.get('status')??'');
      const q=z.string().max(100).parse(url.searchParams.get('q')??'');
      const page=z.coerce.number().int().min(1).max(100000).parse(url.searchParams.get('page')??1);
      return reply(store.leads(status,q,page));
    }
    if(request.method==='GET'&&path==='content')return reply({...store.state(),releases:store.releases(),audit:store.audit()});
    if(request.method==='POST'&&(path==='uploads/image'||path==='uploads/apk')){
      const asset=await receiveAsset(request,path.endsWith('apk')?'apk':'image');store.registerAsset(asset.id,asset.extension,asset.mime,asset.size,actor.id);return reply(asset,201);
    }
    if(!['PUT','POST'].includes(request.method))return reply({message:'Endereço não encontrado.'},404);
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new SiteError(415,'Formato inválido.');
    const body=await readInterestBody(request, 32768);
    if(request.method==='PUT'&&/^leads\/[0-9a-f-]{36}$/.test(path)){
      const data=leadSchema.parse(body);store.review(path.slice(6),data.status,data.notes,data.expectedRevision,actor.id);return reply({ok:true});
    }
    if(path==='draft'&&request.method==='PUT'){
      const data=z.object({content:contentSchema,expectedRevision:z.number().int().nonnegative()}).strict().parse(body);return reply(store.saveDraft(data.content,data.expectedRevision,actor.id));
    }
    if(path==='publish'&&request.method==='POST'){
      const data=z.object({expectedRevision:z.number().int().nonnegative()}).strict().parse(body);return reply(store.publish(data.expectedRevision,actor.id));
    }
    if(path==='restore'&&request.method==='POST'){
      const data=z.object({id:z.number().int().positive(),expectedRevision:z.number().int().nonnegative()}).strict().parse(body);return reply(store.restore(data.id,data.expectedRevision,actor.id));
    }
    return reply({message:'Endereço não encontrado.'},404);
  }catch(error){
    if(error instanceof SiteError)return reply({message:error.message},error.status);
    if(error instanceof z.ZodError||error instanceof SyntaxError)return reply({message:'Confira os campos informados.'},400);
    if(error instanceof RangeError)return reply({message:'Conteúdo maior que o permitido.'},413);
    console.error('Site management unavailable');return reply({message:'Operação indisponível. Tente novamente.'},503);
  }
}
export const GET=handle;export const PUT=handle;export const POST=handle;

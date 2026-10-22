import type {GooglePlacesService} from '../places/google-places-service.js';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {authenticateAdminPrincipal} from '../admin/admin-authorization.js';
import type {AdminRepository} from '../admin/admin-repository.js';
import type {AdminHumanAuthRepository} from '../admin/admin-human-auth-repository.js';
import {GuideError,guideId} from './guide.js';
import {guideImagePublic,type GuideStore} from './guide-store.js';
export async function guideRoutes(input:{request:IncomingMessage;response:ServerResponse;url:URL;store:GuideStore;admin:AdminRepository;humans:AdminHumanAuthRepository;
  json:(r:ServerResponse,status:number,body:unknown)=>void;readJson:(r:IncomingMessage)=>Promise<unknown>;readBinary:(r:IncomingMessage,max:number)=>Promise<Buffer>;places?:GooglePlacesService|null;
}):Promise<boolean>{
  const {request,response,url,store,json}=input,base='/v1/admin/guide',pub='/v1/content/guide';
  if(url.pathname!==base&&!url.pathname.startsWith(base+'/')&&url.pathname!==pub&&!url.pathname.startsWith(pub+'/'))return false;
  try{
    const admin=url.pathname===base||url.pathname.startsWith(base+'/');let actor='';
    if(admin){const a=await authenticateAdminPrincipal({apiKeys:input.admin,humanAuth:input.humans,headers:request.headers,requiredScope:request.method==='GET'?'communications:read':'communications:write'});actor=a.name;response.setHeader('cache-control','no-store');}
    if(request.method==='GET'&&url.pathname===pub){json(response,200,await store.published());return true;}
    if(admin&&request.method==='GET'&&url.pathname===base){json(response,200,await store.read());return true;}
    if(admin&&request.method==='GET'&&url.pathname===base+'/places'){const q=(url.searchParams.get('q')??'').trim();if(q.length<3||q.length>160)throw new GuideError('GUIDE_QUERY','Digite de 3 a 160 caracteres.');if(!input.places)throw new GuideError('GUIDE_SEARCH_UNAVAILABLE','Busca indisponível. Você pode marcar o ponto no mapa.',503);json(response,200,{items:await input.places.searchText({query:q,localOnly:false})});return true;}
    if(admin&&request.method==='GET'&&url.pathname===base+'/history'){json(response,200,{items:await store.history()});return true;}
    if(admin&&request.method==='PUT'&&url.pathname===base){json(response,200,await store.write(await input.readJson(request),actor));return true;}
    if(admin&&request.method==='PUT'&&url.pathname===base+'/images'){
      const mime=String(request.headers['content-type']??'').split(';')[0]!;if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new GuideError('GUIDE_IMAGE_TYPE','Envie JPEG, PNG ou WebP.',415);
      const bytes=await input.readBinary(request,8*1024*1024);
      const valid=mime==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
      if(!valid)throw new GuideError('GUIDE_IMAGE_INVALID','Arquivo de imagem inválido.');
      const id=await store.upload(mime,bytes);json(response,201,{url:pub+'/images/'+id});return true;
    }
    const match=url.pathname.match(/^\/v1\/(admin|content)\/guide\/images\/([^/]+)$/);
    if(request.method==='GET'&&match){const id=guideId(match[2]);if(!admin&&!await guideImagePublic(store,id))throw new GuideError('GUIDE_NOT_FOUND','Foto não encontrada.',404);
      const img=await store.image(id);if(!img)throw new GuideError('GUIDE_NOT_FOUND','Foto não encontrada.',404);
      response.writeHead(200,{'content-type':img.mime,'content-length':String(img.bytes.length),'x-content-type-options':'nosniff','cache-control':admin?'no-store':'public, max-age=300, must-revalidate'});response.end(img.bytes);return true;}
    json(response,404,{error:'NOT_FOUND'});return true;
  }catch(e){if(!(e instanceof GuideError))throw e;json(response,e.status,{error:e.code,message:e.message});return true;}
}

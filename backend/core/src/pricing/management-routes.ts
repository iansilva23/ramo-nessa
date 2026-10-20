import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AdminRepository } from '../admin/admin-repository.js';
import type { AdminHumanAuthRepository } from '../admin/admin-human-auth-repository.js';
import { authenticateAdminPrincipal } from '../admin/admin-authorization.js';
import { authenticateAdminHumanSession, reauthenticateAdminHuman } from '../admin/admin-human-auth-service.js';
import type { PricingCatalogVersionRepository } from './pricing-catalog-version-repository.js';
import { resolvePricingCatalogContext } from './effective-catalog.js';
import { managementView, saveManagementChange } from './management-service.js';
import { ManagementError } from './managed-operations.js';
import type { GooglePlacesService } from '../places/google-places-service.js';
import type { RoutingDistanceProvider } from '../routing/distance-provider.js';
import { parseQuoteRequest } from './validation.js';
import { authoritativeManagedQuote } from './authoritative-quote.js';
import type { GeoPoint } from '../matching/select-driver.js';

export async function pricingManagementRoutes(input:{
  request:IncomingMessage;response:ServerResponse;url:URL;
  admin:AdminRepository;humans:AdminHumanAuthRepository;versions:PricingCatalogVersionRepository;
  json:(response:ServerResponse,status:number,body:unknown)=>void;readJson:(request:IncomingMessage)=>Promise<unknown>;
  places:GooglePlacesService|null;routing:RoutingDistanceProvider|null;
  encryptionKey:Buffer;rateLimitSecret:string;
}):Promise<boolean>{
  const {request,response,url,json}=input;
  const base='/v1/admin/pricing/management';
  if(!url.pathname.startsWith(base))return false;
  if(request.method==='GET'){
    await authenticateAdminPrincipal({apiKeys:input.admin,humanAuth:input.humans,headers:request.headers,requiredScope:'pricing:read'});
    if(url.pathname===base){
      const current=await resolvePricingCatalogContext({versions:input.versions});
      json(response,200,managementView(current.snapshot,current.version));return true;
    }
    if(url.pathname===base+'/history'){
      const rows=await input.versions.list(50);
      json(response,200,{items:rows.filter(r=>r.status==='published').map(r=>({id:r.id,date:r.publishedAt,actor:r.createdBy.name,
        regions:r.snapshot.managedOperations?.regions.filter(r=>!r.archived).length??null,
        rates:r.snapshot.managedOperations?.rates.filter(r=>!r.archived).length??null}))});return true;
    }
    if(url.pathname===base+'/search'){
      if(!input.places)throw new ManagementError('MAP_SEARCH_UNAVAILABLE','Busca indisponível. Você pode posicionar o alfinete no mapa.',503);
      const query=(url.searchParams.get('q')??'').trim();
      if(query.length<3||query.length>160)throw new ManagementError('MANAGEMENT_INVALID','Digite de 3 a 160 caracteres para pesquisar.');
      const items=await input.places.searchText({query,localOnly:false});
      json(response,200,{items});return true;
    }
  }
  if(request.method==='PUT'&&url.pathname===base){
    const auth=await authenticateAdminHumanSession({repository:input.humans,headers:request.headers,requiredScope:'pricing:write'});
    const raw=await input.readJson(request);
    if(raw==null||typeof raw!=='object'||Array.isArray(raw))throw new ManagementError('MANAGEMENT_INVALID','Dados inválidos.');
    const body=raw as Record<string,unknown>;
    const saved=await saveManagementChange({
      versions:input.versions,admin:input.admin,actor:{kind:'user',id:auth.user.id,name:auth.user.name},
      requestId:body.requestId as string,expectedRevision:body.expectedRevision as string,mutation:body.mutation,
      reauthenticate:async()=>{
        const confirmation=body.confirmation as Record<string,unknown>|undefined;
        if(!confirmation)throw new ManagementError('REAUTH_REQUIRED','Confirme com sua senha e um novo código MFA.',428);
        await reauthenticateAdminHuman({repository:input.humans,headers:request.headers,password:confirmation.password,totpCode:confirmation.totpCode,
          encryptionKey:input.encryptionKey,rateLimitSecret:input.rateLimitSecret});
      },
    });
    // Resolve again: a response retry must not show an obsolete active version.
    const current=await resolvePricingCatalogContext({versions:input.versions});
    json(response,200,{...managementView(current.snapshot,current.version),savedVersionId:saved.id});return true;
  }
  if(request.method==='POST'&&url.pathname===base+'/simulate'){
    await authenticateAdminPrincipal({apiKeys:input.admin,humanAuth:input.humans,headers:request.headers,requiredScope:'pricing:read'});
    const raw=await input.readJson(request) as Record<string,unknown>;
    if(raw==null||typeof raw!=='object')throw new ManagementError('MANAGEMENT_INVALID','Simulação inválida.');
    const current=await resolvePricingCatalogContext({versions:input.versions});
    if(!current.snapshot.managedOperations)throw new ManagementError('CATALOG_NOT_PREPARED','Aguarde a preparação do catálogo.',409);
    const quote=await authoritativeManagedQuote({catalog:current.snapshot,request:parseQuoteRequest(raw),pickup:raw.pickup as GeoPoint,dropoff:raw.dropoff as GeoPoint,routing:input.routing});
    json(response,200,{quote,simulation:true,requestId:randomUUID()});return true;
  }
  json(response,404,{error:'NOT_FOUND'});return true;
}

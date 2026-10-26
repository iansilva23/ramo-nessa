import type {IncomingMessage,ServerResponse} from 'node:http';
import {DriverNavigationControlStore,NavigationControlError,type NavigationMode} from './driver-navigation-control.js';
import type {RoutingRouteProvider} from './route-provider.js';

export async function driverNavigationRoutes(input:{request:IncomingMessage;response:ServerResponse;url:URL;
 store:DriverNavigationControlStore|null;provider:RoutingRouteProvider|null;
 authenticate:()=>Promise<string>;readJson:(request:IncomingMessage)=>Promise<unknown>;
 json:(response:ServerResponse,status:number,body:unknown)=>void}):Promise<boolean>{
 const {request,response,json,store,provider}=input;
 const match=input.url.pathname.match(/^\/v1\/driver\/me\/rides\/([0-9a-f-]{36})\/navigation(?:\/(route))?$/i);
 if(!match)return false;
 const driverId=await input.authenticate(),rideId=match[1]!;
 if(!store){json(response,503,{error:'NAVIGATION_STORAGE_UNAVAILABLE'});return true;}
 try{
  if(request.method==='GET'&&!match[2]){json(response,200,{control:await store.state(rideId,driverId)});return true;}
  if(request.method!=='POST'){json(response,405,{error:'METHOD_NOT_ALLOWED'});return true;}
  const body=await input.readJson(request),b=(body&&typeof body==='object'?body:{}) as Record<string,unknown>;
  if(!match[2]){
   if(!['internal','paused','own','external'].includes(String(b.mode))){json(response,400,{error:'INVALID_NAVIGATION_MODE'});return true;}
   json(response,200,{control:await store.mode(rideId,driverId,b.mode as NavigationMode)});return true;
  }
  if(!provider){json(response,503,{error:'ROUTING_NOT_CONFIGURED'});return true;}
  const o=b.origin as Record<string,unknown>|undefined;
  if(!o||typeof o.latitude!=='number'||!Number.isFinite(o.latitude)||Math.abs(o.latitude)>90||
   typeof o.longitude!=='number'||!Number.isFinite(o.longitude)||Math.abs(o.longitude)>180||
   !['initial','resume','off_route'].includes(String(b.reason))){json(response,422,{error:'INVALID_NAVIGATION_REQUEST'});return true;}
  // Destination and phase come only from the authenticated ride, never from the client.
  const reservation=await store.reserve(rideId,driverId,b.reason as 'initial'|'resume'|'off_route');
  let route;
  try{route=await provider.route({from:{latitude:o.latitude,longitude:o.longitude},to:reservation.destination});}
  catch(error){await store.finish(rideId,reservation.token,false);throw error;}
  await store.finish(rideId,reservation.token,true);
  json(response,200,{...route,control:await store.state(rideId,driverId)});
 }catch(error){
  if(error instanceof NavigationControlError)json(response,error.status,{error:error.code,...(error.control?{control:error.control}:{})});
  else json(response,503,{error:'NAVIGATION_PROVIDER_UNAVAILABLE'});
 }
 return true;
}

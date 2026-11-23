import {createHmac} from 'node:crypto';
import type {OperationalSettingsRepository} from '../config/operational-settings-repository.js';
import type {DriverSupplyRepository} from './driver-supply-repository.js';

const categories=new Set(['moto','car','buggy','delivery','comfort_black']);
export function validNearbyPoint(latitude:number,longitude:number){
 return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180&&(latitude!==0||longitude!==0);
}
function distanceKm(a:number,b:number,c:number,d:number){
 const rad=Math.PI/180,x=Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
 return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,x))));
}
export async function passengerNearbyVehicles(input:{
 drivers:DriverSupplyRepository;settings:OperationalSettingsRepository;
 latitude:number;longitude:number;sessionKey:string;
 canUseDriver:(id:string)=>Promise<boolean>;now?:Date;
}){
 if(!validNearbyPoint(input.latitude,input.longitude)||!input.sessionKey)throw Error('Invalid nearby location or session.');
 const now=(input.now??new Date()).getTime(),settings=await input.settings.get();
 const maxAge=Math.min(60,Math.max(5,settings.driverLocationMaxAgeSeconds));
 const radius=Math.min(5,Math.max(.1,settings.nearbyDriverMaxDistanceKm));
 const candidates=(await input.drivers.listOnline()).filter(d=>{
  const age=(now-Date.parse(d.locationUpdatedAt))/1000;
  const reserved=d.reservedRideId!=null&&(!d.reservedUntil||!Number.isFinite(Date.parse(d.reservedUntil))||Date.parse(d.reservedUntil)>now);
  return d.online&&!d.busy&&!reserved&&validNearbyPoint(d.latitude,d.longitude)&&Number.isFinite(age)&&age>=0&&age<maxAge&&d.categories.some(c=>categories.has(c));
 }).map(d=>({driver:d,distance:distanceKm(input.latitude,input.longitude,d.latitude,d.longitude)}))
 .filter(d=>d.distance<=radius).sort((a,b)=>a.distance-b.distance).slice(0,40);
 const eligible=await Promise.all(candidates.map(async c=>({candidate:c,allowed:await input.canUseDriver(c.driver.driverId)})));
 return {refreshAfterSeconds:8,vehicles:eligible.filter(c=>c.allowed).slice(0,20).map(({candidate:{driver:d}})=>({
  // Stable for animation within this session/hour, unrelated to account IDs.
  id:createHmac('sha256',input.sessionKey).update(Math.floor(now/3600000)+':'+d.driverId).digest('hex').slice(0,24),
  category:d.categories.find(c=>categories.has(c))!,
  latitude:Math.round(d.latitude*10000)/10000,longitude:Math.round(d.longitude*10000)/10000,
  expiresAfterSeconds:Math.max(1,Math.min(15,Math.floor(maxAge-(now-Date.parse(d.locationUpdatedAt))/1000))),
 }))};
}

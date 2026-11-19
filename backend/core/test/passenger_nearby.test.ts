import assert from 'node:assert/strict';
import test from 'node:test';
import {passengerNearbyVehicles,validNearbyPoint} from '../src/drivers/passenger-nearby-service.js';
import {InMemoryOperationalSettingsRepository} from '../src/config/in-memory-operational-settings-repository.js';
import {InMemoryDriverSupplyRepository} from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import type {DriverSupplyRecord} from '../src/drivers/driver-supply.js';
const now=new Date('2026-10-24T01:00:10Z'),point={latitude:-2.82017,longitude:-40.41467};
const supply=(id:string,override:Partial<DriverSupplyRecord>={}):DriverSupplyRecord=>({driverId:id,vehicleId:'vehicle-'+id,categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,...point,locationUpdatedAt:now.toISOString(),updatedAt:now.toISOString(),...override});
async function fixture(rows:DriverSupplyRecord[],blocked:string[]=[]){
 const drivers=new InMemoryDriverSupplyRepository(),settings=new InMemoryOperationalSettingsRepository();for(const row of rows)await drivers.upsert(row);
 return {drivers,settings,...point,sessionKey:'synthetic-passenger-session',canUseDriver:async(id:string)=>!blocked.includes(id),now};
}
test('passenger sees real nearby available fleet using all five categories, with scoped anonymous references',async()=>{
 const rows=['moto','car','buggy','delivery','comfort_black'].map((category,i)=>supply('driver-private-'+i,{categories:[category as DriverSupplyRecord['categories'][number]]}));
 const input=await fixture(rows),result=await passengerNearbyVehicles(input);
 assert.equal((await input.settings.get()).showNearbyDrivers,false,'Driver-only switch is independent');
 assert.equal(result.vehicles.length,5);assert.equal(result.refreshAfterSeconds,8);
 for(const [i,v]of result.vehicles.entries()){
  assert.equal(v.category,rows[i]!.categories[0]);assert.match(v.id,/^[a-f0-9]{24}$/);
  assert.deepEqual(Object.keys(v).sort(),['category','expiresAfterSeconds','id','latitude','longitude']);
  assert.equal(v.latitude,-2.8202);assert.equal(v.longitude,-40.4147);
 }
 assert.equal(JSON.stringify(result).includes('driver-private'),false);assert.equal(JSON.stringify(result).includes('vehicle-'),false);
 assert.deepEqual((await passengerNearbyVehicles(input)).vehicles,result.vehicles);
 assert.notEqual((await passengerNearbyVehicles({...input,sessionKey:'another-passenger'})).vehicles[0]?.id,result.vehicles[0]?.id);
});
test('offline, occupied, reserved, distant, blocked, stale and future GPS never appear',async()=>{
 const input=await fixture([
  supply('available'),supply('offline',{online:false}),supply('busy',{busy:true}),supply('reserved',{reservedRideId:'ride-private',reservedUntil:new Date(now.getTime()+30000).toISOString()}),
  supply('far',{latitude:-3.5}),supply('stale',{locationUpdatedAt:new Date(now.getTime()-61000).toISOString()}),supply('future',{locationUpdatedAt:new Date(now.getTime()+1000).toISOString()}),supply('blocked'),
 ],['blocked']);
 const result=await passengerNearbyVehicles(input);assert.equal(result.vehicles.length,1);
 await input.drivers.upsert(supply('available',{online:false}));assert.equal((await passengerNearbyVehicles(input)).vehicles.length,0);
});
test('stale limit and radius honor ADM settings; feed expires without pretending availability',async()=>{
 const input=await fixture([supply('near-expiry',{locationUpdatedAt:new Date(now.getTime()-59000).toISOString()}),supply('out-of-radius',{latitude:point.latitude+.02})]);
 await input.settings.update({nearbyDriverMaxDistanceKm:.5,updatedAt:now.toISOString()});
 const result=await passengerNearbyVehicles(input);assert.equal(result.vehicles.length,1);assert.equal(result.vehicles[0]?.expiresAfterSeconds,1);
 assert.equal((await passengerNearbyVehicles({...input,now:new Date(now.getTime()+2000)})).vehicles.length,0);
});
test('bounds and maximum marker count are enforced',async()=>{
 for(const [lat,lng]of [[NaN,1],[91,1],[1,181],[0,0],[Infinity,1]])assert.equal(validNearbyPoint(lat!,lng!),false);
 const input=await fixture(Array.from({length:50},(_,i)=>supply('driver-'+i)));
 assert.equal((await passengerNearbyVehicles(input)).vehicles.length,20);
 await assert.rejects(passengerNearbyVehicles({...input,latitude:NaN}));
});

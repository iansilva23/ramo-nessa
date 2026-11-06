import type {AdminActor} from '../admin/admin-repository.js';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';

export type NavigationMode='internal'|'paused'|'own'|'external';
export type NavigationStage='pickup'|'dropoff';
export interface NavigationState {
 mode:NavigationMode; recalculations:number; pickupRequested:boolean; dropoffRequested:boolean;
 lastRequestAt:number|null; inFlightUntil:number|null;
}
export const initialNavigationState=():NavigationState=>({mode:'internal',recalculations:0,pickupRequested:false,dropoffRequested:false,lastRequestAt:null,inFlightUntil:null});
export class NavigationControlError extends Error {
 constructor(public code:string,public status=409,public control?:NavigationState){super(code);}
}
export function reserveNavigation(state:NavigationState,stage:NavigationStage,now:number):NavigationState {
 if(state.mode!=='internal')throw new NavigationControlError('NAVIGATION_PAUSED',409,state);
 if((state.inFlightUntil??0)>now)throw new NavigationControlError('NAVIGATION_BUSY',429,state);
 if(state.lastRequestAt!=null&&now-state.lastRequestAt<15000)throw new NavigationControlError('NAVIGATION_COOLDOWN',429,state);
 const initial=!(stage==='pickup'?state.pickupRequested:state.dropoffRequested);
 if(!initial&&state.recalculations>=4)throw new NavigationControlError('NAVIGATION_LIMIT',409,state);
 return {...state,recalculations:state.recalculations+(initial?0:1),
  ...(stage==='pickup'?{pickupRequested:true}:{dropoffRequested:true}),lastRequestAt:now,inFlightUntil:now+30000};
}
const active=new Set(['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS']);
function decode(row:Record<string,unknown>):NavigationState {
 const ms=(v:unknown)=>v==null?null:new Date(v as string).getTime();
 return {mode:row.mode as NavigationMode,recalculations:Number(row.recalculations),pickupRequested:row.pickup_requested===true,
  dropoffRequested:row.dropoff_requested===true,lastRequestAt:ms(row.last_request_at),inFlightUntil:ms(row.in_flight_until)};
}
export class DriverNavigationControlStore {
 constructor(private pool:Pool){}
 async policy(){return (await this.pool.query('SELECT enabled,revision FROM driver_navigation_policy WHERE singleton=true')).rows[0] as {enabled:boolean;revision:number};}
 async savePolicy(value:unknown,actor:AdminActor){
  const b=value as {enabled?:unknown;revision?:unknown};
  if(!b||typeof b.enabled!=='boolean'||!Number.isInteger(b.revision))throw new NavigationControlError('INVALID_NAVIGATION_POLICY',400);
  return this.transact(async c=>{
   const current=(await c.query('SELECT enabled,revision FROM driver_navigation_policy WHERE singleton=true FOR UPDATE')).rows[0];
   if(current.revision!==b.revision)throw new NavigationControlError('NAVIGATION_POLICY_CONFLICT');
   const row=(await c.query('UPDATE driver_navigation_policy SET enabled=$1,revision=revision+1 WHERE singleton=true RETURNING enabled,revision',[b.enabled])).rows[0];
   await c.query('INSERT INTO driver_navigation_policy_audit(id,enabled,revision,actor_kind,actor_id,actor_name) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),row.enabled,row.revision,actor.kind,actor.id,actor.name]);
   return row as {enabled:boolean;revision:number};
  });
 }
 async usage(){
  return (await this.pool.query("SELECT count(*)::int AS requests,count(*) FILTER(WHERE reason='initial')::int AS initial,count(*) FILTER(WHERE reason<>'initial')::int AS recalculations,count(*) FILTER(WHERE outcome='provider_error')::int AS errors FROM driver_navigation_requests WHERE created_at>=now()-interval '30 days'")).rows[0];
 }
 private async authorized(c:PoolClient,rideId:string,driverId:string){
  const ride=(await c.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE',[rideId])).rows[0];
  if(!ride||ride.driver_id!==driverId)throw new NavigationControlError('RIDE_NOT_FOUND',404);
  if(!active.has(ride.state))throw new NavigationControlError('RIDE_NOT_ACTIVE');
  await c.query('INSERT INTO driver_navigation_control(ride_id) VALUES($1) ON CONFLICT DO NOTHING',[rideId]);
  return ride;
 }
 async state(rideId:string,driverId:string){return this.transact(async c=>{
  await this.authorized(c,rideId,driverId);
  return {...decode((await c.query('SELECT * FROM driver_navigation_control WHERE ride_id=$1',[rideId])).rows[0]),enabled:(await c.query('SELECT enabled FROM driver_navigation_policy WHERE singleton=true')).rows[0].enabled};
 });}
 async mode(rideId:string,driverId:string,mode:NavigationMode){return this.transact(async c=>{
  await this.authorized(c,rideId,driverId);
  const old=decode((await c.query('SELECT * FROM driver_navigation_control WHERE ride_id=$1',[rideId])).rows[0]);
  if(mode==='internal'&&(await c.query('SELECT enabled FROM driver_navigation_policy WHERE singleton=true')).rows[0].enabled&&old.mode!=='internal'&&old.recalculations>=4)throw new NavigationControlError('NAVIGATION_LIMIT',409,old);
  return {...decode((await c.query('UPDATE driver_navigation_control SET mode=$2,updated_at=now() WHERE ride_id=$1 RETURNING *',[rideId,mode])).rows[0]),enabled:(await c.query('SELECT enabled FROM driver_navigation_policy WHERE singleton=true')).rows[0].enabled};
 });}
 async reserve(rideId:string,driverId:string,reason:'initial'|'off_route'|'resume'){
  return this.transact(async c=>{
   const policy=(await c.query('SELECT enabled FROM driver_navigation_policy WHERE singleton=true FOR SHARE')).rows[0];
   if(!policy?.enabled)throw new NavigationControlError('NAVIGATION_CONTROL_DISABLED');
   const ride=await this.authorized(c,rideId,driverId),stage:NavigationStage=ride.state==='IN_PROGRESS'?'dropoff':'pickup';
   const latitude=Number(stage==='pickup'?ride.pickup_latitude:ride.dropoff_latitude);
   const longitude=Number(stage==='pickup'?ride.pickup_longitude:ride.dropoff_longitude);
   if((stage==='pickup'?ride.pickup_latitude:ride.dropoff_latitude)==null||(stage==='pickup'?ride.pickup_longitude:ride.dropoff_longitude)==null||!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw new NavigationControlError('DESTINATION_UNAVAILABLE');
   const old=decode((await c.query('SELECT * FROM driver_navigation_control WHERE ride_id=$1',[rideId])).rows[0]);
   const initial=!(stage==='pickup'?old.pickupRequested:old.dropoffRequested);
   const state=reserveNavigation(old,stage,Date.now()),token=randomUUID();
   await c.query('UPDATE driver_navigation_control SET recalculations=$2,pickup_requested=$3,dropoff_requested=$4,last_request_at=to_timestamp($5/1000.0),in_flight_token=$6,in_flight_until=to_timestamp($7/1000.0),updated_at=now() WHERE ride_id=$1',
    [rideId,state.recalculations,state.pickupRequested,state.dropoffRequested,state.lastRequestAt,token,state.inFlightUntil]);
   await c.query('INSERT INTO driver_navigation_requests(id,ride_id,stage,reason) VALUES($1,$2,$3,$4)',[token,rideId,stage,initial?'initial':reason==='initial'?'resume':reason]);
   return {state,token,stage,destination:{latitude,longitude}};
  });
 }
 async finish(rideId:string,token:string,success:boolean){
  await this.transact(async c=>{
   await c.query('UPDATE driver_navigation_requests SET outcome=$2,completed_at=now() WHERE id=$1',[token,success?'success':'provider_error']);
   await c.query('UPDATE driver_navigation_control SET in_flight_token=NULL,in_flight_until=NULL WHERE ride_id=$1 AND in_flight_token=$2',[rideId,token]);
  });
 }
 private async transact<T>(operation:(c:PoolClient)=>Promise<T>):Promise<T>{
  const c=await this.pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='8s'");const result=await operation(c);await c.query('COMMIT');return result;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}

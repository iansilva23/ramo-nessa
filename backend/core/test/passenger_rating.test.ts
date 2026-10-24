import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import test from 'node:test';
import {authenticateBearer, issueAuthSession} from '../src/auth/auth-service.js';
import {InMemoryAuthOtpRepository} from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import {InMemoryAuthSessionRepository} from '../src/auth/repositories/in-memory-auth-session-repository.js';
import {readJsonBody} from '../src/http/request-body.js';
import {createRide} from '../src/rides/create-ride.js';
import {passengerRatingRoutes} from '../src/rides/passenger-rating-routes.js';
import {InMemoryRideRepository} from '../src/rides/repositories/in-memory-ride-repository.js';

test('passenger rating HTTP: real sessions, ownership, completed ride, validation and immutable retry',async()=>{
 const rides=new InMemoryRideRepository(),identities=new InMemoryAuthOtpRepository(),sessions=new InMemoryAuthSessionRepository();
 async function account(subjectType:'passenger'|'driver',phoneE164:string){const subjectId=randomUUID(),at=new Date().toISOString();await identities.createIdentity({id:subjectId,subjectId,subjectType,phoneE164,status:'active',createdAt:at,updatedAt:at});return{subjectId,...await issueAuthSession({repository:sessions,subjectId,subjectType})};}
 const driver=await account('driver','+5588999990011'),passenger=await account('passenger','+5588999990012'),outsider=await account('driver','+5588999990013');
 const ride=await createRide(rides,{passengerId:passenger.subjectId,quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day'}});ride.driverId=driver.subjectId;ride.state='IN_PROGRESS';await rides.save(ride);
 const server=createServer(async(request,response)=>{const json=(r:typeof response,status:number,body:unknown)=>{r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(body));};try{if(!await passengerRatingRoutes({request,response,url:new URL(request.url!,'http://localhost'),rides,readJson:readJsonBody,json,authenticate:async()=>(await authenticateBearer({repository:sessions,identities,headers:request.headers,requiredType:'driver'})).subjectId}))json(response,404,{});}catch{json(response,401,{});}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port+'/v1/driver/me/rides/'+ride.id+'/passenger-rating';
 const call=(method='GET',body?:unknown,token:string|null=driver.token)=>fetch(url,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  assert.equal((await call('GET',undefined,null)).status,401);assert.equal((await call('POST',{stars:5},passenger.token)).status,401);
  assert.equal((await call('GET',undefined,outsider.token)).status,404);assert.equal((await call('POST',{stars:5},outsider.token)).status,404);
  assert.equal((await call('POST',{stars:5})).status,409);assert.equal((await call()).status,409);
  ride.state='COMPLETED';await rides.save(ride);assert.deepEqual(await(await call()).json(),{rating:null});
  for(const body of [{stars:0},{stars:6},{stars:2.5},{stars:'5'},{stars:5,reasons:['unknown']},{stars:5,reasons:['polite','polite']},{stars:5,reasons:null},{stars:5,comment:7},{stars:5,comment:'a'.repeat(1001)}])assert.equal((await call('POST',body)).status,400);
  const first=await call('POST',{stars:4,reasons:['polite','communication'],comment:'  Muito educado  '});assert.equal(first.status,201);const saved=await first.json() as any;
  assert.equal(saved.rating.passengerId,passenger.subjectId);assert.equal(saved.rating.driverId,driver.subjectId);assert.equal(saved.rating.stars,4);assert.equal(saved.rating.comment,'Muito educado');assert.equal(saved.duplicate,false);
  const second=await call('POST',{stars:1,reasons:[],comment:'changed'});assert.equal(second.status,200);const retry=await second.json() as any;assert.equal(retry.duplicate,true);assert.deepEqual(retry.rating,saved.rating);
  assert.deepEqual((await(await call()).json() as any).rating,saved.rating);assert.equal((await rides.findById(ride.id))?.quote.totalAmountCents,ride.quote.totalAmountCents);
  ride.state='CANCELLED_BY_ADMIN';await rides.save(ride);assert.equal((await call('POST',{stars:5})).status,409);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('PostgreSQL persists one passenger rating under concurrent requests',{skip:process.env.RAMO_RATING_TEST_POSTGRES!=='true'},async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/ramonessa');
 const{Pool}=await import('pg');const{PostgresRideRepository}=await import('../src/rides/repositories/postgres-ride-repository.js');const pool=new Pool({connectionString:url.toString(),max:4}),rides=new PostgresRideRepository(pool);
 const ride=await createRide(rides,{passengerId:randomUUID(),quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day'}});const driverId=randomUUID();ride.driverId=driverId;ride.state='COMPLETED';await rides.save(ride);
 const record={rideId:ride.id,driverId,passengerId:ride.passengerId,stars:5,reasons:['punctual'],comment:null,createdAt:new Date().toISOString()};
 try{const result=await Promise.all(Array.from({length:8},(_,i)=>rides.recordPassengerRating({...record,stars:i%5+1})));assert.equal(result.filter(r=>r?.created).length,1);const original=result.find(r=>r?.created)!.rating;for(const r of result)assert.deepEqual(r?.rating,original);assert.deepEqual(await new PostgresRideRepository(pool).findPassengerRating(ride.id,driverId),original);assert.equal(await rides.findPassengerRating(ride.id,'outsider'),null);assert.equal(await rides.recordPassengerRating({...record,driverId:'outsider'}),null);assert.equal(Number((await pool.query('SELECT count(*) FROM passenger_ratings WHERE ride_id=$1',[ride.id])).rows[0].count),1);}finally{await pool.query('DELETE FROM rides WHERE id=$1',[ride.id]);await pool.end();}
});

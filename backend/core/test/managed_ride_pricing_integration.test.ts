import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {InMemoryDriverSupplyRepository} from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import {InMemoryRideRepository} from '../src/rides/repositories/in-memory-ride-repository.js';
import {InMemoryRidePreparationRepository} from '../src/rides/in-memory-ride-preparation-repository.js';
import {InMemoryFinanceRepository} from '../src/payments/repositories/in-memory-finance-repository.js';
import {createPaymentForRide} from '../src/payments/create-payment.js';
import {prepareRideForPayment} from '../src/rides/prepare-ride.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {prepareThreeRegionCatalog,applyManagementMutation} from '../src/pricing/management-service.js';
import {quoteFare} from '../src/pricing/quote-engine.js';
import {authoritativeManagedQuote} from '../src/pricing/authoritative-quote.js';
const pickup={latitude:-2.82017,longitude:-40.41467},dropoff={latitude:-2.825,longitude:-40.415};
const now=new Date('2026-10-20T15:00:00Z');
async function setup(){
  const rides=new InMemoryRideRepository(),drivers=new InMemoryDriverSupplyRepository();
  const preparation=new InMemoryRidePreparationRepository(rides,drivers);
  await drivers.upsert({driverId:'managed-driver',vehicleId:'managed-vehicle',categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,
    ...pickup,locationUpdatedAt:now.toISOString(),updatedAt:now.toISOString()});
  return {rides,drivers,preparation};
}
const request={origin:{zoneId:'prea' as const,localityId:'prea'},destination:{zoneId:'prea' as const,localityId:'prea'},category:'car' as const,period:'day' as const,passengers:1};
test('displayed managed quote, reserved ride and payment agree; legacy pickup fee cannot leak in',async()=>{
  const ctx=await setup();
  const snapshot=applyManagementMutation(prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),{kind:'rate.save',rate:{
    id:'synthetic-fixed',name:'Synthetic integration rate',kind:'fixed',originRegionId:'prea',destinationRegionId:'prea',bidirectional:true,
    categoryId:'car',enabled:true,archived:false,day:{amountCents:2700,minimumCents:0},night:null,includedPassengers:1,perExtraPassengerCents:0,extras:[],
  }}).snapshot;
  const routing={async routeDistanceKm(){return 5;}};
  const displayed=await authoritativeManagedQuote({catalog:snapshot,request,pickup,dropoff,routing});
  const ride=await prepareRideForPayment({repository:ctx.preparation,drivers:ctx.drivers,routing,
    pricing:{snapshot,version:null,reference:{catalogVersion:'managed-test',catalogVersionId:randomUUID()}},
    passengerId:'synthetic-passenger',quoteRequest:{...request,tripDistanceKm:0.001},pickup,dropoff,now,
    pickupFeeForDistance:()=>99900,
  });
  assert.equal(ride.quote.totalAmountCents,displayed.kind==='exact'?displayed.totalAmountCents:-1);
  assert.equal(ride.quote.totalAmountCents,2700);assert.equal(ride.quote.pickupCompensationCents,0);
  assert.equal((await ctx.drivers.findByDriverId('managed-driver'))!.reservedRideId,ride.id);
  const payment=await createPaymentForRide(new InMemoryFinanceRepository(),{ride,method:'pix',processor:'test-gateway',idempotencyKey:'managed-price-equality',now});
  assert.equal(payment.amountCents,2700);
  snapshot.managedOperations!.rates[0]!.day!.amountCents=9900;
  const newer=quoteFare(request,snapshot);
  assert.equal(newer.kind==='exact'?newer.totalAmountCents:-1,9900);
  assert.equal((await ctx.rides.findById(ride.id))!.quote.totalAmountCents,2700);
});
test('km preparation uses authoritative route, availability and immutable price',async()=>{
  const ctx=await setup(),snapshot=applyManagementMutation(prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),{kind:'rate.save',rate:{
    id:'synthetic-km',name:'Synthetic distance integration rate',kind:'distance',originRegionId:'prea',destinationRegionId:'prea',bidirectional:true,
    categoryId:'car',enabled:true,archived:false,day:{amountCents:300,minimumCents:900},night:null,includedPassengers:1,perExtraPassengerCents:0,extras:[],
  }}).snapshot;
  const distances:number[]=[];
  const ride=await prepareRideForPayment({repository:ctx.preparation,drivers:ctx.drivers,
    routing:{async routeDistanceKm(){const distance=distances.length===0?7:0.2;distances.push(distance);return distance;}},
    pricing:{snapshot,version:null,reference:{catalogVersion:'managed-test'}},passengerId:'synthetic-passenger',quoteRequest:{...request,tripDistanceKm:0},
    pickup,dropoff,now});
  assert.equal(ride.tripDistanceKm,7);assert.equal(ride.quote.totalAmountCents,2100);
  assert.equal(ride.quote.platformCommissionCents+ride.quote.driverNetCents,2100);
});

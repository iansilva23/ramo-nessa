import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import type { DriverSupplyRecord } from '../src/drivers/driver-supply.js';
import {
  rankEligibleDrivers,
  rideRequiresFourByFour,
  selectDriverForDispatch,
} from '../src/matching/select-driver.js';
import type { RideRecord } from '../src/rides/ride.js';
import { transitionRide, markRidePaid, RideStateError, type RideState } from '../src/rides/ride-state.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { requiresFourByFourForTrip } from '../src/pricing/category-eligibility.js';

const now = new Date('2026-09-23T12:00:00.000Z');

function ride(overrides: Partial<RideRecord> = {}): RideRecord {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    passengerId: 'passenger-matching',
    state: 'PAID',
    paymentStatus: 'paid',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 2,
    quote: {
      ruleId: 'prea-jijoca-car',
      baseAmountCents: 12000,
      pickupCompensationCents: 0,
      totalAmountCents: 12000,
      platformCommissionCents: 1200,
      driverNetCents: 10800,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function supply(
  driverId: string,
  overrides: Partial<DriverSupplyRecord> = {},
): DriverSupplyRecord {
  return {
    driverId,
    vehicleId: `vehicle-${driverId}`,
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.821,
    longitude: -40.414,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

test('driver-supply é a fonte única de disponibilidade do matching', async () => {
  const repository = new InMemoryDriverSupplyRepository();

  await repository.upsert(
    supply('driver-offline', { online: false }),
  );
  await repository.upsert(supply('driver-online'));

  const online = await repository.listOnline();

  assert.deepEqual(
    online.map((item) => item.driverId),
    ['driver-online'],
  );
});

test('matching ordena o motorista elegível mais próximo', () => {
  const ranked = rankEligibleDrivers({
    ride: ride(),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply('driver-far', {
        latitude: -2.90,
        longitude: -40.45,
      }),
      supply('driver-near', {
        latitude: -2.821,
        longitude: -40.414,
      }),
    ],
    now,
  });

  assert.equal(ranked[0]?.supply.driverId, 'driver-near');
  assert.equal(ranked[0]?.routeDistanceRequiredForFinalFare, true);
});

test('Comfort para/de Jeri exige 4x4 elegível', () => {
  const currentRide = ride({
    category: 'comfort_black',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    passengers: 3,
  });

  const ranked = rankEligibleDrivers({
    ride: currentRide,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply('comfort-common', {
        categories: ['comfort_black'],
        fourByFour: false,
      }),
      supply('comfort-4x4', {
        categories: ['comfort_black'],
        fourByFour: true,
        latitude: -2.83,
      }),
    ],
    now,
  });

  assert.deepEqual(
    ranked.map((item) => item.supply.driverId),
    ['comfort-4x4'],
  );
  assert.equal(rideRequiresFourByFour(currentRide), true);
});

test('capacidade real e localização recente são obrigatórias', () => {
  const ranked = rankEligibleDrivers({
    ride: ride({ passengers: 4 }),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply('capacity-2', { seatCapacity: 2 }),
      supply('stale', {
        seatCapacity: 4,
        locationUpdatedAt: '2026-09-23T11:55:00.000Z',
      }),
      supply('eligible', { seatCapacity: 4 }),
    ],
    now,
    maxLocationAgeSeconds: 60,
  });

  assert.deepEqual(
    ranked.map((item) => item.supply.driverId),
    ['eligible'],
  );
});

test('matching não inicia antes de pagamento confirmado', () => {
  assert.throws(
    () =>
      selectDriverForDispatch({
        ride: ride({
          state: 'AWAITING_PAYMENT',
          paymentStatus: 'pending',
        }),
        pickup: { latitude: -2.82017, longitude: -40.41467 },
        candidates: [supply('driver-1')],
        now,
      }),
    /depois da corrida estar PAID/,
  );
});

test('corrida paga entra em SEARCHING_DRIVER com candidato elegível', () => {
  const selected = selectDriverForDispatch({
    ride: ride(),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [supply('driver-1')],
    now,
  });

  assert.equal(selected.nextRideState, 'SEARCHING_DRIVER');
  assert.equal(selected.driver.supply.driverId, 'driver-1');
});

test('Jeri local não força 4x4 por esta regra de corredor', () => {
  const localJeri = ride({
    category: 'comfort_black',
    origin: { zoneId: 'jericoacoara' },
    destination: { zoneId: 'jericoacoara' },
  });

  assert.equal(rideRequiresFourByFour(localJeri), false);
});


test('matching respeita a política 4x4 congelada na corrida', () => {
  const currentRide = ride({
    category: 'comfort_black',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    passengers: 2,
    requiresFourByFour: false,
  });

  const ranked = rankEligibleDrivers({
    ride: currentRide,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply('comfort-common-frozen', {
        categories: ['comfort_black'],
        fourByFour: false,
      }),
      supply('comfort-4x4-frozen', {
        categories: ['comfort_black'],
        fourByFour: true,
        latitude: -2.84,
      }),
    ],
    now,
  });

  assert.equal(rideRequiresFourByFour(currentRide), false);
  assert.deepEqual(
    ranked.map((item) => item.supply.driverId),
    ['comfort-common-frozen', 'comfort-4x4-frozen'],
  );
});

test('política publicada de corredor 4x4 chega ao matching via snapshot da corrida', () => {
  const origin = {zoneId:'prea' as const,localityId:'prea'};
  const destination = {zoneId:'jericoacoara' as const,localityId:'jericoacoara'};
  const required = requiresFourByFourForTrip({
    catalog:STATIC_PRICING_CATALOG_V1,origin,destination,category:'car',
  });
  assert.equal(required,true);
  const currentRide = ride({
    origin,destination,category:'car',requiresFourByFour:required,
  });
  const ranked = rankEligibleDrivers({
    ride:currentRide,pickup:{latitude:-2.82017,longitude:-40.41467},
    candidates:[
      supply('near-ordinary',{fourByFour:false}),
      supply('far-4x4',{fourByFour:true,latitude:-2.84}),
    ],now,
  });
  assert.deepEqual(ranked.map(row=>row.supply.driverId),['far-4x4']);
  assert.equal(rideRequiresFourByFour(currentRide),true);
  assert.throws(()=>selectDriverForDispatch({
    ride:currentRide,pickup:{latitude:-2.82017,longitude:-40.41467},
    candidates:[supply('ordinary-only',{fourByFour:false})],now,
  }),/Nenhum motorista elegível/);
  const returning = ride({
    origin:destination,destination:origin,category:'car',
    requiresFourByFour:requiresFourByFourForTrip({
      catalog:STATIC_PRICING_CATALOG_V1,
      origin:destination,destination:origin,category:'car',
    }),
  });
  assert.deepEqual(rankEligibleDrivers({
    ride:returning,pickup:{latitude:-2.80023,longitude:-40.51638},
    candidates:[supply('return-ordinary',{fourByFour:false}),
      supply('return-4x4',{fourByFour:true})],now,
  }).map(row=>row.supply.driverId),['return-4x4']);
});

test('estado PAID sem pagamento confirmado não libera busca de motorista', () => {
  for (const paymentStatus of ['pending','failed'] as const) {
    assert.throws(() => selectDriverForDispatch({
      ride:ride({state:'PAID',paymentStatus}),
      pickup:{latitude:-2.82017,longitude:-40.41467},
      candidates:[supply('driver-paid-state-only')],
      now,
    }));
  }
});

test('busca não seleciona motorista reservado por outra corrida', () => {
  const ranked = rankEligibleDrivers({
    ride:ride(),
    pickup:{latitude:-2.82017,longitude:-40.41467},
    candidates:[
      supply('reserved-other',{reservedRideId:'another-ride',
        reservedUntil:'2026-09-23T12:01:00.000Z'}),
      supply('free-driver',{latitude:-2.83}),
    ],
    now,
  });
  assert.deepEqual(ranked.map(item=>item.supply.driverId),['free-driver']);
});

test('reserva vencida libera motorista e reserva da mesma corrida não bloqueia', () => {
  const currentRide = ride();
  const ranked = rankEligibleDrivers({
    ride: currentRide,
    pickup: {latitude:-2.82017,longitude:-40.41467},
    candidates: [
      supply('held-other-active',{
        reservedRideId:'other-ride',reservedUntil:'2026-09-23T12:01:00.000Z',
      }),
      supply('held-other-expired',{
        reservedRideId:'other-ride',reservedUntil:'2026-09-23T11:59:59.000Z',
        latitude:-2.822,
      }),
      supply('held-same-ride',{
        reservedRideId:currentRide.id,reservedUntil:'2026-09-23T12:01:00.000Z',
        latitude:-2.823,
      }),
    ],now,
  });
  assert.deepEqual(ranked.map(item=>item.supply.driverId),
    ['held-other-expired','held-same-ride']);
});

test('indisponibilidade do motorista impede despacho mesmo com pagamento confirmado', () => {
  const currentRide=ride();
  const pickup={latitude:-2.82017,longitude:-40.41467};
  const candidates=[
    supply('offline',{online:false}),
    supply('busy',{busy:true}),
    supply('stale',{locationUpdatedAt:'2026-09-23T11:50:00.000Z'}),
    supply('no-category',{categories:['moto']}),
    supply('no-capacity',{seatCapacity:1}),
  ];
  assert.deepEqual(rankEligibleDrivers({ride:currentRide,pickup,candidates,now}),[]);
  assert.throws(()=>selectDriverForDispatch({ride:currentRide,pickup,candidates,now}),
    (error:unknown)=>error instanceof Error && error.message.includes('Nenhum motorista elegível'));
});

test('aceite, recusa e cancelamento respeitam os estados autorizados da corrida', () => {
  assert.equal(transitionRide('SEARCHING_DRIVER','DRIVER_ASSIGNED'),'DRIVER_ASSIGNED');
  assert.equal(transitionRide('SEARCHING_DRIVER','NO_DRIVER_FOUND'),'NO_DRIVER_FOUND');
  assert.equal(transitionRide('NO_DRIVER_FOUND','SEARCHING_DRIVER'),'SEARCHING_DRIVER');
  assert.equal(transitionRide('DRIVER_ASSIGNED','CANCELLED_BY_DRIVER'),'CANCELLED_BY_DRIVER');
  assert.equal(transitionRide('CANCELLED_BY_DRIVER','SEARCHING_DRIVER'),'SEARCHING_DRIVER');
  assert.equal(transitionRide('CANCELLED_BY_DRIVER','REFUND_PENDING'),'REFUND_PENDING');
  assert.equal(transitionRide('REFUND_PENDING','REFUNDED'),'REFUNDED');
  for (const [from,to] of [
    ['AWAITING_PAYMENT','DRIVER_ASSIGNED'],
    ['SEARCHING_DRIVER','IN_PROGRESS'],
    ['NO_DRIVER_FOUND','DRIVER_ASSIGNED'],
    ['REFUNDED','SEARCHING_DRIVER'],
    ['COMPLETED','REFUND_PENDING'],
  ] as const) {
    assert.throws(()=>transitionRide(from,to),RideStateError);
  }
});

test('ciclo isolado pagamento confirmado → despacho 4x4 → conclusão', () => {
  const origin={zoneId:'prea' as const,localityId:'prea'};
  const destination={zoneId:'jericoacoara' as const,localityId:'jericoacoara'};
  const requiresFourByFour=requiresFourByFourForTrip({
    catalog:STATIC_PRICING_CATALOG_V1,origin,destination,category:'car',
  });
  const paidState=markRidePaid('AWAITING_PAYMENT',{
    status:'paid',amountCents:12000,
  });
  const currentRide=ride({
    state:paidState,paymentStatus:'paid',origin,destination,
    category:'car',requiresFourByFour,
  });
  const dispatch=selectDriverForDispatch({
    ride:currentRide,
    pickup:{latitude:-2.82017,longitude:-40.41467},
    candidates:[
      supply('ordinary-driver',{fourByFour:false}),
      supply('approved-4x4',{fourByFour:true,latitude:-2.83}),
    ],now,
  });
  assert.equal(dispatch.nextRideState,'SEARCHING_DRIVER');
  assert.equal(dispatch.driver.supply.driverId,'approved-4x4');
  let state:RideState=dispatch.nextRideState;
  for (const next of ['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED',
    'IN_PROGRESS','COMPLETED'] as const) {
    state=transitionRide(state,next);
  }
  assert.equal(state,'COMPLETED');
  assert.throws(()=>transitionRide(state,'SEARCHING_DRIVER'),RideStateError);
});

test('ciclo isolado sem motorista permite tentar novamente ou solicitar reembolso', () => {
  const currentRide=ride();
  assert.throws(()=>selectDriverForDispatch({
    ride:currentRide,pickup:{latitude:-2.82017,longitude:-40.41467},
    candidates:[],now,
  }),/Nenhum motorista elegível/);
  const noDriver=transitionRide('SEARCHING_DRIVER','NO_DRIVER_FOUND');
  assert.equal(transitionRide(noDriver,'SEARCHING_DRIVER'),'SEARCHING_DRIVER');
  const refundPending=transitionRide(noDriver,'REFUND_PENDING');
  assert.equal(transitionRide(refundPending,'REFUNDED'),'REFUNDED');
});

test('GPS corrompido em motorista não impede matching de outro elegível', () => {
  const pickup={latitude:-2.82017,longitude:-40.41467};
  const ranked=rankEligibleDrivers({
    ride:ride(),pickup,now,
    candidates:[
      supply('invalid-nan',{latitude:Number.NaN}),
      supply('invalid-lat',{latitude:91}),
      supply('invalid-lon',{longitude:-181}),
      supply('valid-driver',{latitude:-2.822}),
    ],
  });
  assert.deepEqual(ranked.map(item=>item.supply.driverId),['valid-driver']);
  const selected=selectDriverForDispatch({
    ride:ride(),pickup,now,
    candidates:[supply('invalid-inf',{longitude:Number.POSITIVE_INFINITY}),
      supply('valid-driver',{latitude:-2.822})],
  });
  assert.equal(selected.driver.supply.driverId,'valid-driver');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresDriverBenefitRepository } from '../src/benefits/repositories/postgres-driver-benefit-repository.js';
import { parseCreateDriverBenefitCampaign, setDriverBenefitCampaignStatus, updateDriverBenefitCampaign } from '../src/admin/admin-driver-benefits-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const actor = { kind: 'user' as const, id: 'benefits-audit', name: 'Operador' };
const now = new Date('2026-10-20T12:00:00Z');

test('PostgreSQL: categoria, regiões, base, seleção, cancelamento estornado e datas preservam pontuação',
  { skip: !databaseUrl }, async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresDriverBenefitRepository(pool);
    const suffix = randomUUID();
    const zone = `region-${suffix}`;
    const ids = ['a', 'b', 'c', 'suspended', 'car-only'].map(id => `benefit-${id}-${suffix}`);
    const [a, b, c, suspended, car] = ids as [string, string, string, string, string];
    const rideIds: string[] = [];
    const campaign = parseCreateDriverBenefitCampaign({
      name: 'Teste PostgreSQL de Ranking', category: 'moto', regionMode: 'ride', participantMode: 'eligible',
      regions: [{ zoneId: zone, localityId: 'centro' }], participantDriverIds: [], excludedDriverIds: [],
      startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z',
      topCount: 3, minParticipants: 3, ridePoints: 20, fiveStarPoints: 5, fourStarPoints: 2,
      lowCancellationMaxBps: 500, lowCancellationBonusPoints: 100, missions: [], prizes: [],
    });
    async function ride(driverId: string, category: string, origin: string, destination: string,
      occurredAt = '2026-10-05T12:00:00Z', state = 'COMPLETED', locality = 'centro') {
      const id = randomUUID(); rideIds.push(id);
      await pool.query(`INSERT INTO rides
        (id, passenger_id, driver_id, state, payment_status, origin_zone_id, origin_locality_id,
         destination_zone_id, destination_locality_id, category, price_period, passengers,
         pricing_rule_id, base_amount_cents, pickup_compensation_cents, total_amount_cents,
         platform_commission_cents, driver_net_cents, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'CONFIRMED',$5,$6,$7,$6,$8,'day',1,'benefits-fixture',1000,0,1000,100,900,$9,$9)`,
        [id, `passenger-${suffix}`, driverId, state, origin, locality, destination, category, occurredAt]);
      return id;
    }
    async function rate(id: string, driverId: string, stars: number, createdAt = '2026-10-06T12:00:00Z') {
      await pool.query('INSERT INTO driver_ratings (ride_id,passenger_id,driver_id,stars,created_at) VALUES ($1,$2,$3,$4,$5)',
        [id, `passenger-${suffix}`, driverId, stars, createdAt]);
    }
    try {
      assert.equal(await repository.findCampaign("' OR 1=1 --"), null);
      await assert.rejects(repository.setDriverBase({ driverId: `missing-${suffix}`, zoneId: zone, updatedAt: now.toISOString() }),
        { code: 'INVALID_DRIVER_BENEFIT_BASE' });
      for (const [i, driverId] of ids.entries()) {
        await pool.query(`INSERT INTO driver_profiles (driver_id,full_name,status,created_at,updated_at)
          VALUES ($1,'Motorista Sobrenome',$2,now(),now())`, [driverId, driverId === suspended ? 'suspended' : 'approved']);
        await pool.query(`INSERT INTO driver_vehicles
          (id,driver_id,plate_normalized,make,model,model_year,color,categories,seat_capacity,status,created_at,updated_at)
          VALUES ($1,$2,$3,'Honda','Teste',2026,'Amarelo',$4,4,'approved',now(),now())`,
          [randomUUID(), driverId, `plate-${i}-${suffix}`, driverId === car ? ['car'] : ['moto', 'car']]);
      }
      for (const driverId of [a, c]) await repository.setDriverBase({ driverId, zoneId: zone, localityId: 'centro', updatedAt: now.toISOString() });
      await repository.setDriverBase({ driverId: b, zoneId: 'elsewhere', updatedAt: now.toISOString() });
      const complete = await ride(a, 'moto', zone, 'elsewhere'); await rate(complete, a, 5);
      await ride(a, 'car', zone, 'elsewhere');
      const outside = await ride(a, 'moto', 'elsewhere', 'elsewhere'); await rate(outside, a, 4);
      await ride(a, 'moto', zone, 'elsewhere', '2026-10-05T12:00:00Z', 'COMPLETED', 'outra-localidade');
      const cancelled = await ride(a, 'moto', zone, 'elsewhere', '2026-10-07T12:00:00Z', 'CANCELLED_BY_DRIVER');
      await pool.query("UPDATE rides SET state='REFUNDED',updated_at='2026-10-08T12:00:00Z' WHERE id=$1", [cancelled]);
      const lateRating = await ride(a, 'moto', zone, 'elsewhere', '2026-10-10T12:00:00Z');
      await rate(lateRating, a, 5, '2026-11-02T12:00:00Z');
      await ride(a, 'moto', zone, 'elsewhere', '2026-09-30T12:00:00Z');
      await ride(a, 'moto', zone, 'elsewhere', '2026-11-01T00:00:00Z');
      const destination = await ride(b, 'moto', 'elsewhere', zone); await rate(destination, b, 4);
      await ride(suspended, 'moto', zone, 'elsewhere');
      await ride(car, 'moto', zone, 'elsewhere');
      const stats = await repository.rankingStats(campaign, now);
      assert.deepEqual(stats.map(s => s.driverId).sort(), [a, b].sort());
      const own = stats.find(s => s.driverId === a)!;
      assert.equal(own.completedRides, 2);
      assert.equal(own.cancelledByDriver, 1);
      assert.equal(own.fiveStarRatings, 1);
      assert.equal(own.fourStarRatings, 0);
      assert.equal(stats.find(s => s.driverId === b)?.fourStarRatings, 1);
      // A later update cannot move a completion into a different campaign.
      await pool.query("UPDATE rides SET updated_at='2026-12-01T00:00:00Z' WHERE id=$1", [complete]);
      assert.deepEqual(await repository.rankingStats(campaign, now), stats);
      const base = await repository.rankingStats({ ...campaign, regionMode: 'driver_base' }, now);
      assert.deepEqual(base.map(s => s.driverId).sort(), [a, c].sort());
      assert.equal(base.find(s => s.driverId === a)?.completedRides, 4);
      const both = await repository.rankingStats({ ...campaign, regionMode: 'both' }, now);
      assert.deepEqual(both.map(s => s.driverId).sort(), [a, c].sort());
      assert.equal(both.find(s => s.driverId === a)?.completedRides, 2);
      const everywhere = await repository.rankingStats({ ...campaign, regions: [] }, now);
      assert.equal(everywhere.find(s => s.driverId === a)?.completedRides, 4);
      const selected = await repository.rankingStats({ ...campaign, participantMode: 'selected', participantDriverIds: [a, b], excludedDriverIds: [a] }, now);
      assert.deepEqual(selected.map(s => s.driverId), [b]);
      assert.deepEqual(await repository.rankingStats({ ...campaign, regions: [{ zoneId: "' OR 1=1 --" }] }, now), []);
    } finally {
      await pool.query('DELETE FROM rides WHERE id=ANY($1::uuid[])', [rideIds]);
      await pool.query('DELETE FROM driver_profiles WHERE driver_id=ANY($1::text[])', [ids]);
      await pool.end();
    }
  });

test('PostgreSQL: revisão atômica e resultado encerrado sobrevivem a restart e alteração de perfil',
  { skip: !databaseUrl }, async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresDriverBenefitRepository(pool);
    const admin = new InMemoryAdminRepository();
    const id = `benefit-history-${randomUUID()}`;
    const rideId = randomUUID();
    const campaign = parseCreateDriverBenefitCampaign({
      name: 'Resultado persistente', category: 'moto', regionMode: 'ride', participantMode: 'selected',
      regions: [], participantDriverIds: [id], excludedDriverIds: [],
      startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z',
      topCount: 1, minParticipants: 1, ridePoints: 20, fiveStarPoints: 5, fourStarPoints: 2,
      lowCancellationMaxBps: 500, lowCancellationBonusPoints: 100, missions: [], prizes: [{ rank: 1, label: 'Pix manual' }],
    }, new Date('2026-09-30T12:00:00Z'));
    try {
      await pool.query(`INSERT INTO driver_profiles (driver_id,full_name,status,created_at,updated_at)
        VALUES ($1,'Ana Sobrenome','approved',now(),now())`, [id]);
      await pool.query(`INSERT INTO driver_vehicles
        (id,driver_id,plate_normalized,make,model,model_year,color,categories,seat_capacity,status,created_at,updated_at)
        VALUES ($1,$2,$2,'Honda','Teste',2026,'Amarelo',ARRAY['moto'],1,'approved',now(),now())`, [randomUUID(), id]);
      await pool.query(`INSERT INTO rides
        (id,passenger_id,driver_id,state,payment_status,origin_zone_id,destination_zone_id,category,price_period,passengers,
         pricing_rule_id,base_amount_cents,pickup_compensation_cents,total_amount_cents,platform_commission_cents,driver_net_cents,created_at,updated_at)
        VALUES ($1,$2,$2,'COMPLETED','CONFIRMED','prea','prea','moto','day',1,'benefits-fixture',1000,0,1000,100,900,'2026-10-10','2026-10-10')`, [rideId, id]);
      await repository.createCampaign(campaign);
      const updates = await Promise.allSettled(['Operador A', 'Operador B'].map(name => repository.updateCampaign({ ...campaign, name, updatedAt: now.toISOString() }, campaign.updatedAt)));
      assert.equal(updates.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(updates.filter(r => r.status === 'rejected').length, 1);
      const saved = (await repository.findCampaign(campaign.id))!;
      const active = await setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
        body: { status: 'active', expectedUpdatedAt: saved.updatedAt }, now });
      await assert.rejects(updateDriverBenefitCampaign({ repository, admin, actor, id: campaign.id,
        body: { category: 'car', expectedUpdatedAt: active.updatedAt }, now }), { code: 'DRIVER_BENEFIT_RULES_LOCKED' });
      const ended = await setDriverBenefitCampaignStatus({ repository, admin, actor, id: campaign.id,
        body: { status: 'ended', expectedUpdatedAt: active.updatedAt }, now });
      const final = await repository.rankingStats(ended, now);
      assert.equal(final[0]?.completedRides, 1);
      await pool.query("UPDATE driver_profiles SET status='suspended',full_name='Nome Diferente' WHERE driver_id=$1", [id]);
      const restarted = new PostgresDriverBenefitRepository(pool);
      assert.deepEqual(await restarted.rankingStats(ended, new Date('2026-12-01')), final);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM driver_benefit_results WHERE campaign_id=$1', [campaign.id])).rows[0].count, 1);
    } finally {
      await pool.query('DELETE FROM driver_benefit_campaigns WHERE id=$1', [campaign.id]);
      await pool.query('DELETE FROM rides WHERE id=$1', [rideId]);
      await pool.query('DELETE FROM driver_profiles WHERE driver_id=$1', [id]);
      await pool.end();
    }
  });

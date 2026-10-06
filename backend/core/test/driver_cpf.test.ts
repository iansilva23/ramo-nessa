import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { normalizeDriverCpf } from '../src/drivers/driver-cpf.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import { PostgresDriverRegistryRepository } from '../src/drivers/repositories/postgres-driver-registry-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';
import type { DriverRegistryRepository, DriverProfileRecord, DriverVehicleRecord } from '../src/drivers/driver-registry-repository.js';
const now = new Date().toISOString();
const profile = (driverId: string): DriverProfileRecord => ({driverId,fullName:'Motorista CPF',status:'pending',createdAt:now,updatedAt:now});
const vehicle = (driverId: string,plate: string): DriverVehicleRecord => ({id:randomUUID(),driverId,plateNormalized:plate,make:'Honda',model:'CG',modelYear:2024,color:'Preta',categories:['moto'],fourByFour:false,seatCapacity:2,status:'pending',createdAt:now,updatedAt:now});
test('CPF accepts formatted valid values and rejects bad check digits/repeated digits', () => {
  assert.equal(normalizeDriverCpf('529.982.247-25'), '52998224725');
  for (const value of [undefined,'','00000000000','11111111111','52998224724','52998224725extra']) assert.throws(() => normalizeDriverCpf(value), {code:'DRIVER_CPF_INVALID'});
});
async function uniqueScenario(registry: DriverRegistryRepository) {
  const first = randomUUID(),second=randomUUID();
  const results = await Promise.allSettled([first,second].map(id => registry.createRegistration({profile:profile(id),vehicle:vehicle(id,id),cpf:'52998224725'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const failed=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
  assert.equal(failed.reason.message,'REGISTRATION_CPF_CONFLICT');
  const winner=results[0]!.status==='fulfilled'?first:second;
  const loser=winner===first?second:first;
  assert.equal(await registry.findProfile(loser),null);
  assert.equal(await registry.findVehicleByDriverId(loser),null);
  assert.equal(await registry.hasCpf(winner),true);
  await registry.bindCpf(winner,'52998224725');
  await assert.rejects(registry.bindCpf(winner,'11144477735'), /REGISTRATION_CPF_IMMUTABLE/);
  assert.equal(JSON.stringify(await registry.findProfile(winner)).includes('52998224725'),false);
  return [first,second];
}
test('CPF uniqueness is atomic and binding cannot change, even with another phone/account', async () => {await uniqueScenario(new InMemoryDriverRegistryRepository());});
test('existing drivers can bind CPF once without overwriting approved profile', async () => {
  const registry=new InMemoryDriverRegistryRepository();
  await registry.upsertProfile({...profile('legacy-driver'),status:'approved'});
  await registry.bindCpf('legacy-driver','11144477735');
  assert.equal((await registry.findProfile('legacy-driver'))?.status,'approved');
});
test('PostgreSQL CPF uniqueness rolls back losing concurrent account completely', {skip:!process.env.DATABASE_URL}, async () => {
  const pool=createPostgresPool(process.env.DATABASE_URL!);
  const registry=new PostgresDriverRegistryRepository(pool);
  // Use another valid CPF from registration fixtures; clean by test-specific names.
  try {await uniqueScenario(registry);}
  finally {await pool.query("DELETE FROM driver_profiles WHERE full_name='Motorista CPF'");await pool.end();}
});

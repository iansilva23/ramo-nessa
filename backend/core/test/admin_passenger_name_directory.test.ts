import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import type {AuthOtpRepository,AuthIdentityRecord} from '../src/auth/auth-otp-repository.js';
import {InMemoryAuthOtpRepository} from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import {PostgresAuthOtpRepository} from '../src/auth/repositories/postgres-auth-otp-repository.js';
import {createPostgresPool} from '../src/db/postgres.js';

async function verify(repository:AuthOtpRepository,rows:AuthIdentityRecord[]){
 for(const row of rows)await repository.createIdentity(row);
 for(const search of ['João','JOAO','silva','Conceicao','joao da']){
  const page=await repository.listIdentities({subjectType:'passenger',search,limit:20});
  assert.deepEqual(page.identities.map(x=>x.subjectId),[rows[0]!.subjectId],search);
  assert.equal(page.identities[0]?.fullName,'João da Silva Conceição');
 }
 for(const search of [rows[0]!.subjectId,rows[0]!.phoneE164,rows[0]!.emailNormalized!]){
  const page=await repository.listIdentities({subjectType:'passenger',search,limit:20});
  assert.equal(page.identities[0]?.subjectId,rows[0]!.subjectId);
 }
 const suspended=await repository.listIdentities({subjectType:'passenger',search:'joao',status:'suspended',limit:20});
 assert.equal(suspended.identities.length,0);
 const first=await repository.listIdentities({subjectType:'passenger',search:'conceicao',limit:1});
 assert.equal(first.identities.length,1);
 const last=first.identities[0]!;
 const next=await repository.listIdentities({subjectType:'passenger',search:'conceicao',limit:1,cursor:{id:last.id,updatedAt:last.updatedAt}});
 assert.equal(next.identities.length,0);
 // Changing the visible name must not change account identifiers or contacts.
 const updated=await repository.setPassengerAccount({subjectId:rows[0]!.subjectId,fullName:'Maria Oliveira',updatedAt:'2026-10-24T01:00:00.000Z'});
 assert.equal(updated?.subjectId,rows[0]!.subjectId);assert.equal(updated?.phoneE164,rows[0]!.phoneE164);
 const renamed=await repository.listIdentities({subjectType:'passenger',search:'maria oliveira',limit:20});
 assert.equal(renamed.identities[0]?.subjectId,rows[0]!.subjectId);
}
function fixtures():AuthIdentityRecord[]{
 const prefix=randomUUID();
 return [
  {id:randomUUID(),subjectId:'p-name-'+prefix,subjectType:'passenger',fullName:'João da Silva Conceição',emailNormalized:prefix+'@example.invalid',phoneE164:'+5588999817301',status:'active',createdAt:'2026-10-23T00:00:00.000Z',updatedAt:'2026-10-23T01:00:00.000Z'},
  {id:randomUUID(),subjectId:'p-unnamed-'+prefix,subjectType:'passenger',phoneE164:'+5588999817302',status:'active',createdAt:'2026-10-23T00:00:00.000Z',updatedAt:'2026-10-23T02:00:00.000Z'},
  {id:randomUUID(),subjectId:'d-name-'+prefix,subjectType:'driver',fullName:'João da Silva Conceição',phoneE164:'+5588999817303',status:'active',createdAt:'2026-10-23T00:00:00.000Z',updatedAt:'2026-10-23T03:00:00.000Z'},
 ];
}
test('passenger directory searches name, accents, partials, contacts and ID without changing identity',async()=>verify(new InMemoryAuthOtpRepository(),fixtures()));
test('PostgreSQL passenger name search persists and preserves pagination and subject isolation',{skip:!process.env.DATABASE_URL},async()=>{
 const pool=createPostgresPool(process.env.DATABASE_URL!);const rows=fixtures();
 try{await verify(new PostgresAuthOtpRepository(pool),rows);}
 finally{await pool.query('DELETE FROM auth_identities WHERE id = ANY($1::uuid[])',[rows.map(x=>x.id)]);await pool.end();}
});

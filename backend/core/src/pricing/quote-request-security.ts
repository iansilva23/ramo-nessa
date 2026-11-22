import {createHash} from 'node:crypto';
import type {PricingCatalogSnapshot} from './catalog-snapshot.js';
import type {AdminHumanAuthRepository} from '../admin/admin-human-auth-repository.js';
import {ManagementError} from './managed-operations.js';
export async function authorizeManagedQuote(input:{
  catalog:PricingCatalogSnapshot;authenticate:()=>Promise<string>;
  limits:Pick<AdminHumanAuthRepository,'consumeRateLimits'>;now?:Date;
}):Promise<void>{
  if(!input.catalog.managedOperations)return;
  // A public legacy arithmetic endpoint must not become an anonymous paid
  // Google Routes proxy when server-authoritative mileage is enabled.
  const passengerId=await input.authenticate();
  const key=createHash('sha256').update('pricing-managed-quote:'+passengerId).digest('hex');
  const result=await input.limits.consumeRateLimits({rules:[{key,limit:60,windowMs:60000}],now:(input.now??new Date()).toISOString()});
  if(!result.allowed)throw new ManagementError('PRICING_RATE_LIMITED','Muitas cotações em sequência. Aguarde um momento e tente novamente.',429);
}

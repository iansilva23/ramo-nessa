import type { PricingCatalogSnapshot } from './catalog-snapshot.js';
import { quoteFare } from './quote-engine.js';
import { PricingError, type QuoteRequest } from './types.js';
import type { RoutingDistanceProvider } from '../routing/distance-provider.js';
import { assertPricingLocationMatchesPoint } from '../rides/pricing-location-validation.js';
import type { GeoPoint } from '../matching/select-driver.js';

export async function authoritativeManagedQuote(input:{
  catalog:PricingCatalogSnapshot;request:QuoteRequest;pickup:GeoPoint;dropoff:GeoPoint;routing:RoutingDistanceProvider|null;
}){
  assertPricingLocationMatchesPoint({catalog:input.catalog,ref:input.request.origin,point:input.pickup,field:'origin'});
  assertPricingLocationMatchesPoint({catalog:input.catalog,ref:input.request.destination,point:input.dropoff,field:'destination'});
  // Client route length and pickup compensation never authorize a charge.
  const {tripDistanceKm:_trip,driverPickupDistanceKm:_pickup,...trusted}=input.request;
  try {return quoteFare(trusted,input.catalog);}
  catch(error){
    if(!(error instanceof PricingError)||error.code!=='MISSING_DISTANCE')throw error;
    if(!input.routing)throw new PricingError('MISSING_DISTANCE','O cálculo de rota está temporariamente indisponível.');
    const distance=await input.routing.routeDistanceKm({from:input.pickup,to:input.dropoff});
    return quoteFare({...trusted,tripDistanceKm:distance},input.catalog);
  }
}

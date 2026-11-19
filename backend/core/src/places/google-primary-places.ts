import type {PricingCatalogSnapshot} from '../pricing/catalog-snapshot.js';
import {classifyCoordinateByCatalog, CoordinateClassificationError} from './coordinate-place-policy.js';
import {GooglePlacesService, type GooglePlaceResult} from './google-places-service.js';
import {managedPlacesBounds} from './managed-places-coverage.js';
import {issuePlaceProof} from './place-proof.js';

/** Search discovery never authorizes coverage, a fare or a ride. */
export async function googlePrimaryPlaces(input:{
  action:'autocomplete'|'details'|'search';
  body:Record<string,unknown>;
  catalog:PricingCatalogSnapshot;
  google:GooglePlacesService;
  proofSecret:string;
  proofTtlSeconds:number;
}) {
  if (!input.catalog.managedOperations) throw Error('Google primary search requires a managed catalog.');
  const {body,catalog,google}=input;
  const query=(key:string)=>typeof body[key]==='string' ? body[key] as string : '';
  const bias=managedPlacesBounds(catalog);
  const annotate=(raw:GooglePlaceResult)=>{
    const place={id:raw.id,name:raw.name,address:raw.address,latitude:raw.latitude,longitude:raw.longitude};
    try {
      const location=classifyCoordinateByCatalog({catalog,latitude:place.latitude,longitude:place.longitude});
      return {...place,approvedPricingZoneId:location.zoneId,approvedPricingLocalityId:location.localityId,
        placeProof:issuePlaceProof({localityId:location.localityId,placeId:place.id,
          latitude:place.latitude,longitude:place.longitude,secret:input.proofSecret,ttlSeconds:input.proofTtlSeconds})};
    } catch(error) {
      if (!(error instanceof CoordinateClassificationError) || error.code!=='COORDINATE_NOT_CLASSIFIED') throw error;
      // Show the selected location; the existing UI explains unavailable coverage.
      // No region hint or signed proof is issued for a point outside coverage.
      return place;
    }
  };
  if (input.action==='autocomplete') {
    const suggestions=await google.autocomplete({query:query('input'),sessionToken:query('sessionToken'),localOnly:false,...(bias?{bias}:{})});
    return {provider:'google',suggestions};
  }
  if (input.action==='details') {
    const place=await google.placeDetails({placeId:query('placeId'),sessionToken:query('sessionToken'),localOnly:false});
    return {provider:'google',place:annotate(place)};
  }
  const places=await google.searchText({query:query('query'),localOnly:false,maxResults:10,...(bias?{bias}:{})});
  return {provider:'google',places:places.map(annotate)};
}

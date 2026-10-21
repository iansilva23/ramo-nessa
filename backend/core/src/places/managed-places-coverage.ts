import type {PricingCatalogSnapshot} from '../pricing/catalog-snapshot.js';
import type {LocalPlacesBounds} from './google-places-service.js';
export function managedPlacesBounds(catalog:PricingCatalogSnapshot):LocalPlacesBounds|undefined{
  const regions=catalog.managedOperations?.regions.filter(r=>r.enabled&&!r.archived);
  if(!regions?.length)return undefined;
  const bounds={minLatitude:90,maxLatitude:-90,minLongitude:180,maxLongitude:-180};
  for(const r of regions){
    const latitudeDelta=r.radiusKm/111.32;
    const longitudeDelta=r.radiusKm/(111.32*Math.max(0.01,Math.cos(r.latitude*Math.PI/180)));
    bounds.minLatitude=Math.min(bounds.minLatitude,Math.max(-90,r.latitude-latitudeDelta));
    bounds.maxLatitude=Math.max(bounds.maxLatitude,Math.min(90,r.latitude+latitudeDelta));
    bounds.minLongitude=Math.min(bounds.minLongitude,Math.max(-180,r.longitude-longitudeDelta));
    bounds.maxLongitude=Math.max(bounds.maxLongitude,Math.min(180,r.longitude+longitudeDelta));
  }
  return bounds;
}

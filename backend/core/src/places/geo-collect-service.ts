import type { GeoPlaceInput } from './geo-catalog-repository.js';

type FetchLike = typeof fetch;
export type GeoCollectionRegion = 'prea' | 'jeri' | 'jijoca';

const regions: Record<GeoCollectionRegion, {
  bbox: [number, number, number, number]; city: string;
}> = {
  prea: { bbox: [-2.865, -40.47, -2.78, -40.36], city: 'Cruz' },
  jeri: { bbox: [-2.83, -40.56, -2.75, -40.465], city: 'Jijoca de Jericoacoara' },
  jijoca: { bbox: [-2.95, -40.53, -2.855, -40.395], city: 'Jijoca de Jericoacoara' },
};
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MAX_RESULTS = 1500;
const MAX_RESPONSE_BYTES = 3_000_000;

interface OsmElement {
  id?: number; type?: 'node' | 'way' | 'relation'; lat?: number; lon?: number;
  center?: {lat?:number;lon?:number};
  tags?: Record<string,string>;
}
interface OsmResponse { elements?: OsmElement[]; remark?: string; }

export class GeoCollectionError extends Error {
  constructor(message:string, public readonly status: 422 | 429 | 503 = 503) {
    super(message); this.name = 'GeoCollectionError';
  }
}
export function geoCollectionQuery(region: GeoCollectionRegion): string {
  const area = regions[region];
  if (!area) throw new GeoCollectionError('Selecione uma localidade válida.',422);
  const bounds = area.bbox.join(',');
  return `[out:json][timeout:20];
(
  nwr["name"]["tourism"~"hotel|guest_house|hostel|apartment|camp_site|attraction|viewpoint|museum"](${bounds});
  nwr["name"]["amenity"~"restaurant|cafe|bar|fast_food|pub|pharmacy|hospital|clinic|school|bank|atm|parking|taxi|bus_station|fuel"](${bounds});
  nwr["name"]["shop"](${bounds});
  nwr["name"]["leisure"~"park|sports_centre|marina"](${bounds});
  nwr["name"]["historic"](${bounds});
  nwr["name"]["place"~"village|hamlet|suburb|neighbourhood"](${bounds});
);
out center ${MAX_RESULTS};`;
}

function osmCategory(tags: Record<string,string>): string {
  for (const category of ['tourism','amenity','shop','leisure','historic','place']) {
    if (typeof tags[category] === 'string') return `${category}:${tags[category]!.slice(0,40)}`;
  }
  return 'other';
}

export function convertOsmElements(
  raw: OsmResponse,
  region: GeoCollectionRegion,
): {places:GeoPlaceInput[];truncated:boolean} {
  const info = regions[region];
  if (!info) throw new GeoCollectionError('Selecione uma localidade válida.',422);
  if (!Array.isArray(raw?.elements)) {
    throw new GeoCollectionError('A fonte OSM não retornou registros válidos.');
  }
  const places: GeoPlaceInput[] = [];
  const seen = new Set<string>();
  const [south,west,north,east] = info.bbox;
  for (const element of raw.elements.slice(0,MAX_RESULTS)) {
    const tags = element.tags ?? {};
    const name = typeof tags.name === 'string' ? tags.name.trim() : '';
    const lat = element.type === 'node' ? element.lat : element.center?.lat;
    const lon = element.type === 'node' ? element.lon : element.center?.lon;
    const type = element.type;
    const id = element.id;
    if (!name || name.length > 160 ||
        !['node','way','relation'].includes(type??'') ||
        !Number.isSafeInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat! < south || lat! > north || lon! < west || lon! > east) continue;
    const sourceId = `${type}/${id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    const road = tags['addr:street']?.trim() ?? '';
    const house = tags['addr:housenumber']?.trim() ?? '';
    const locality = tags['addr:city']?.trim() || info.city;
    const address = [road,house,locality,'Ceará, Brasil'].filter(Boolean)
      .join(', ').slice(0,240);
    places.push({
      source:'osm', sourceId,
      name,
      address,
      category:osmCategory(tags).slice(0,64),
      city:locality.slice(0,100),
      latitude:lat!,longitude:lon!,
    });
  }
  return {places,truncated:raw.elements.length >= MAX_RESULTS};
}

export async function collectOsmPlaces(input: {
  region: GeoCollectionRegion;
  fetcher?: FetchLike;
}):Promise<{places:GeoPlaceInput[];truncated:boolean;region:GeoCollectionRegion}> {
  const query=geoCollectionQuery(input.region);
  let response:Response;
  try {
    response=await (input.fetcher??fetch)(OVERPASS_URL,{
      method:'POST',
      signal:AbortSignal.timeout(25000),
      headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8',
        'accept':'application/json','user-agent':'RamoNessaGeoAgent/0.1'},
      body:new URLSearchParams({data:query}).toString(),
    });
  } catch {
    throw new GeoCollectionError('Fonte OSM indisponível. Tente mais tarde.');
  }
  if (!response.ok) {
    throw new GeoCollectionError(
      response.status===429?'Limite temporário de coleta atingido na fonte OSM.':
        'A fonte OSM não conseguiu processar a área selecionada.',
      response.status===429?429:503);
  }
  if (Number(response.headers.get('content-length')||0)>MAX_RESPONSE_BYTES) {
    throw new GeoCollectionError('Resposta geográfica acima do limite.');
  }
  let raw:OsmResponse;
  try {
    const content=await response.text();
    if (content.length>MAX_RESPONSE_BYTES) throw Error('too large');
    raw=JSON.parse(content) as OsmResponse;
  }catch {throw new GeoCollectionError('A fonte OSM retornou dados inválidos ou extensos.');}
  if (raw.remark) throw new GeoCollectionError('A fonte OSM retornou uma limitação temporária.');
  return { ...convertOsmElements(raw,input.region),region:input.region };
}

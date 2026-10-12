import type { Pool } from 'pg';

export type GeoSource = 'osm' | 'overture' | 'manual';
export interface GeoCatalogPlace {
  id: string;
  source: GeoSource;
  sourceId: string;
  name: string;
  address: string;
  category: string;
  city: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
}
export type GeoPlaceInput = Omit<GeoCatalogPlace, 'id' | 'updatedAt'>;
export type GeoChange = { kind: 'new' | 'changed' | 'unchanged'; place: GeoCatalogPlace };
export interface GeoCatalogRepository {
  search(query: string, localOnly: boolean, limit?: number): Promise<GeoCatalogPlace[]>;
  findById(id: string): Promise<GeoCatalogPlace | null>;
  preview(input: GeoPlaceInput[]): Promise<GeoChange[]>;
  apply(input: GeoPlaceInput[]): Promise<{ added: number; changed: number; unchanged: number }>;
}
const LOCAL = { minLat: -2.98, maxLat: -2.73, minLon: -40.61, maxLon: -40.34 };
export function normalizeGeoText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
export function geoPlaceId(source: GeoSource, sourceId: string): string {
  return `geo:${source}:${sourceId}`;
}
function validate(input: GeoPlaceInput): GeoCatalogPlace {
  if (!input || !(['osm','overture','manual'] as unknown[]).includes(input.source) ||
      typeof input.sourceId !== 'string' || !/^[A-Za-z0-9_.:\/-]{1,160}$/.test(input.sourceId) ||
      typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.length > 160 ||
      typeof input.address !== 'string' || input.address.length > 240 ||
      typeof input.category !== 'string' || input.category.length > 64 ||
      typeof input.city !== 'string' || input.city.length > 100 ||
      !Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90 ||
      !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) {
    throw new Error('GEO_CATALOG_INVALID_RECORD');
  }
  return { ...input, id: geoPlaceId(input.source,input.sourceId),
    name: input.name.trim(), address: input.address.trim(),
    city: input.city.trim(), category: input.category.trim(),
    updatedAt: new Date().toISOString() };
}
export function validateGeoBatch(raw: unknown): GeoPlaceInput[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) {
    throw new Error('GEO_CATALOG_INVALID_BATCH');
  }
  const seen = new Set<string>();
  return raw.map(item => {
    const place = validate(item as GeoPlaceInput);
    if (seen.has(place.id)) throw new Error('GEO_CATALOG_DUPLICATE_ID');
    seen.add(place.id);
    const { id: _id, updatedAt: _updatedAt, ...data } = place;
    return data;
  });
}
export function geoLocal(place: Pick<GeoCatalogPlace,'latitude'|'longitude'>): boolean {
  return place.latitude >= LOCAL.minLat && place.latitude <= LOCAL.maxLat &&
    place.longitude >= LOCAL.minLon && place.longitude <= LOCAL.maxLon;
}
function same(a: GeoCatalogPlace, b: GeoCatalogPlace): boolean {
  return a.source === b.source && a.sourceId === b.sourceId &&
    a.name === b.name && a.address === b.address && a.category === b.category &&
    a.city === b.city && a.latitude === b.latitude && a.longitude === b.longitude;
}
function compare(input: GeoCatalogPlace, previous: GeoCatalogPlace | null): GeoChange {
  return { kind: previous == null ? 'new' : same(previous,input) ? 'unchanged' : 'changed', place: input };
}
export class InMemoryGeoCatalogRepository implements GeoCatalogRepository {
  private readonly records = new Map<string,GeoCatalogPlace>();
  async search(query: string, localOnly: boolean, limit=6): Promise<GeoCatalogPlace[]> {
    const q=normalizeGeoText(query);
    if (q.length < 2) return [];
    return [...this.records.values()]
      .filter(p=>(!localOnly || geoLocal(p)) &&
        (normalizeGeoText(p.name).includes(q) || normalizeGeoText(p.address).includes(q)))
      .sort((a,b)=>{
        const aStart=normalizeGeoText(a.name).startsWith(q)?0:1;
        const bStart=normalizeGeoText(b.name).startsWith(q)?0:1;
        return aStart-bStart || a.name.localeCompare(b.name);
      }).slice(0,Math.min(10,Math.max(1,limit)));
  }
  async findById(id: string): Promise<GeoCatalogPlace|null> {
    return this.records.get(id) ?? null;
  }
  async preview(input: GeoPlaceInput[]): Promise<GeoChange[]> {
    return input.map(raw=>{const p=validate(raw);return compare(p,this.records.get(p.id)??null)});
  }
  async apply(input: GeoPlaceInput[]): Promise<{added:number;changed:number;unchanged:number}> {
    const changes=await this.preview(input);
    const counts={added:0,changed:0,unchanged:0};
    for(const c of changes) {
      if(c.kind==='unchanged'){counts.unchanged++;continue}
      counts[c.kind==='new'?'added':'changed']++;
      this.records.set(c.place.id,c.place);
    }
    return counts;
  }
}
type GeoRow = { id:string;source:GeoSource;source_id:string;name:string;address:string;
  category:string;city:string;latitude:number;longitude:number;updated_at:Date|string };
function fromRow(r:GeoRow): GeoCatalogPlace {
  return {id:r.id,source:r.source,sourceId:r.source_id,name:r.name,address:r.address,
    category:r.category,city:r.city,latitude:Number(r.latitude),
    longitude:Number(r.longitude),updatedAt:new Date(r.updated_at).toISOString()};
}
export class PostgresGeoCatalogRepository implements GeoCatalogRepository {
  constructor(private readonly pool:Pool){}
  async search(query:string,localOnly:boolean,limit=6):Promise<GeoCatalogPlace[]> {
    const q=normalizeGeoText(query);if(q.length<2)return [];
    const {rows}=await this.pool.query<GeoRow>(`
      SELECT * FROM geo_catalog_places
      WHERE (normalized_name LIKE '%' || $1 || '%'
        OR lower(address) LIKE '%' || $1 || '%')
        AND ($2::boolean = false OR
          (latitude BETWEEN $3 AND $4 AND longitude BETWEEN $5 AND $6))
      ORDER BY CASE WHEN normalized_name LIKE $1 || '%' THEN 0 ELSE 1 END,
        normalized_name ASC LIMIT $7`,
      [q,localOnly,LOCAL.minLat,LOCAL.maxLat,LOCAL.minLon,LOCAL.maxLon,Math.min(10,Math.max(1,limit))]);
    return rows.map(fromRow);
  }
  async findById(id:string):Promise<GeoCatalogPlace|null> {
    const {rows}=await this.pool.query<GeoRow>(
      'SELECT * FROM geo_catalog_places WHERE id=$1',[id]);
    return rows[0]?fromRow(rows[0]):null;
  }
  async preview(input:GeoPlaceInput[]):Promise<GeoChange[]> {
    const places=input.map(validate);
    const {rows}=await this.pool.query<GeoRow>(
      'SELECT * FROM geo_catalog_places WHERE id=ANY($1::text[])',
      [places.map(p=>p.id)]);
    const byId=new Map(rows.map(row=>{const p=fromRow(row);return[p.id,p] as const}));
    return places.map(p=>compare(p,byId.get(p.id)??null));
  }
  async apply(input:GeoPlaceInput[]):Promise<{added:number;changed:number;unchanged:number}> {
    const places=input.map(validate);
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      // Serialize imports to keep preview/counting consistent.
      await client.query('SELECT pg_advisory_xact_lock($1)',[67110921]);
      const {rows}=await client.query<GeoRow>(
        'SELECT * FROM geo_catalog_places WHERE id=ANY($1::text[])',
        [places.map(p=>p.id)]);
      const old=new Map(rows.map(r=>{const p=fromRow(r);return[p.id,p] as const}));
      const result={added:0,changed:0,unchanged:0};
      for(const place of places){
        const kind=compare(place,old.get(place.id)??null).kind;
        if(kind==='unchanged'){result.unchanged++;continue}
        if(kind==='new')result.added++;else result.changed++;
        await client.query(`
          INSERT INTO geo_catalog_places
            (id,source,source_id,name,normalized_name,address,category,city,latitude,longitude)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,normalized_name=excluded.normalized_name,
            address=excluded.address,category=excluded.category,
            city=excluded.city,latitude=excluded.latitude,
            longitude=excluded.longitude,updated_at=now()`,
          [place.id,place.source,place.sourceId,place.name,normalizeGeoText(place.name),
            place.address,place.category,place.city,place.latitude,place.longitude]);
      }
      await client.query('COMMIT');
      return result;
    }catch(error){await client.query('ROLLBACK');throw error}
    finally{client.release()}
  }
}

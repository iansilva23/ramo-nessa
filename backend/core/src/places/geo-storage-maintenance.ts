import type { Pool } from 'pg';
import { geoCollectionRegionForPoint, type GeoCollectionRegion } from './geo-collect-service.js';

export interface GeoStoragePolicy {
  maxStorageMb: number;
  alertPercent: number;
  retentionDays: number;
  autoCleanupEnabled: boolean;
  lastCleanupAt: string | null;
}
export interface GeoStorageReport {
  policy: GeoStoragePolicy;
  usedBytes: number;
  catalogBytes: number;
  referenceBytes: number;
  places: number;
  expiredPlaces: number;
  cleanupEligible: number;
  popularDue: number;
  status: 'ok' | 'warning' | 'limit';
}
export interface GeoStorageMaintenance {
  report(): Promise<GeoStorageReport>;
  updatePolicy(input: unknown): Promise<GeoStoragePolicy>;
  recordSelection(id: string): Promise<GeoCollectionRegion | null>;
  dueRegions(): Promise<GeoCollectionRegion[]>;
  cleanup(input: { dryRun: boolean; automatic?: boolean; limit?: number }): Promise<{
    removed: number; eligible: number; dryRun: boolean; skipped?: string;
  }>;
}
type SettingsRow={
  max_storage_mb:number;alert_percent:number;retention_days:number;
  auto_cleanup_enabled:boolean;last_cleanup_at:string|Date|null;
};
const dayMs=24*60*60*1000;
export function parseGeoStoragePolicy(input:unknown):Omit<GeoStoragePolicy,'lastCleanupAt'> {
  if (input==null || typeof input!=='object' || Array.isArray(input)) throw new Error('GEO_STORAGE_INVALID_POLICY');
  const x=input as Record<string,unknown>;
  if(!Number.isInteger(x.maxStorageMb) || Number(x.maxStorageMb)<16 || Number(x.maxStorageMb)>2048 ||
    !Number.isInteger(x.alertPercent) || Number(x.alertPercent)<50 || Number(x.alertPercent)>95 ||
    !Number.isInteger(x.retentionDays) || Number(x.retentionDays)<120 || Number(x.retentionDays)>365 ||
    typeof x.autoCleanupEnabled!=='boolean') throw new Error('GEO_STORAGE_INVALID_POLICY');
  return {maxStorageMb:x.maxStorageMb as number,alertPercent:x.alertPercent as number,
    retentionDays:x.retentionDays as number,autoCleanupEnabled:x.autoCleanupEnabled as boolean};
}
function toPolicy(row:SettingsRow):GeoStoragePolicy{
  return {maxStorageMb:row.max_storage_mb,alertPercent:row.alert_percent,
    retentionDays:row.retention_days,autoCleanupEnabled:row.auto_cleanup_enabled,
    lastCleanupAt:row.last_cleanup_at==null?null:new Date(row.last_cleanup_at).toISOString()};
}
export function geoStorageLevel(usedBytes:number,policy:GeoStoragePolicy):GeoStorageReport['status']{
  const max=policy.maxStorageMb*1024*1024;
  return usedBytes>=max?'limit':usedBytes>=max*policy.alertPercent/100?'warning':'ok';
}
const standard:GeoStoragePolicy={maxStorageMb:128,alertPercent:80,retentionDays:120,
  autoCleanupEnabled:false,lastCleanupAt:null};

export class InMemoryGeoStorageMaintenance implements GeoStorageMaintenance {
  private policy={...standard};
  async report():Promise<GeoStorageReport> {
    return {policy:{...this.policy},usedBytes:0,catalogBytes:0,referenceBytes:0,
      places:0,expiredPlaces:0,cleanupEligible:0,popularDue:0,status:'ok'};
  }
  async updatePolicy(input:unknown):Promise<GeoStoragePolicy> {
    this.policy={...this.policy,...parseGeoStoragePolicy(input)};
    return {...this.policy};
  }
  async recordSelection(_id:string):Promise<GeoCollectionRegion|null>{return null;}
  async dueRegions():Promise<GeoCollectionRegion[]>{return [];}
  async cleanup(input:{dryRun:boolean}):Promise<{removed:number;eligible:number;dryRun:boolean}>{
    return {removed:0,eligible:0,dryRun:input.dryRun};
  }
}
type CountRow={places:string;expired:string;eligible:string;popular_due:string};
type ByteRow={catalog_bytes:string;reference_bytes:string};
type PointRow={latitude:number;longitude:number};
export class PostgresGeoStorageMaintenance implements GeoStorageMaintenance {
  constructor(private readonly pool:Pool){}
  private async settings():Promise<GeoStoragePolicy> {
    const {rows}=await this.pool.query<SettingsRow>('SELECT * FROM geo_storage_settings WHERE id=1');
    if(!rows[0])throw new Error('GEO_STORAGE_SETTINGS_MISSING');
    return toPolicy(rows[0]);
  }
  async report():Promise<GeoStorageReport>{
    const policy=await this.settings();
    const [counts,sizes]=await Promise.all([
      this.pool.query<CountRow>(`
        SELECT count(*)::text AS places,
          count(*) FILTER(WHERE source='osm' AND updated_at<now()-interval '90 days')::text AS expired,
          count(*) FILTER(WHERE source='osm' AND updated_at<now()-interval '1 day' * $1::integer
              AND (last_selected_at IS NULL OR last_selected_at<now()-interval '90 days'))::text AS eligible,
          count(*) FILTER(WHERE source='osm' AND selection_count>=3
              AND last_selected_at>=now()-interval '90 days'
              AND updated_at<now()-interval '75 days')::text AS popular_due
        FROM geo_catalog_places`,[policy.retentionDays]),
      this.pool.query<ByteRow>(`
        SELECT pg_total_relation_size('geo_catalog_places'::regclass)::text AS catalog_bytes,
          (pg_total_relation_size('geo_passenger_place_references'::regclass) +
           pg_total_relation_size('geo_passenger_learning_regions'::regclass))::text AS reference_bytes`),
    ]);
    const count=counts.rows[0],size=sizes.rows[0];
    const catalogBytes=Number(size?.catalog_bytes??0);
    const referenceBytes=Number(size?.reference_bytes??0);
    const usedBytes=catalogBytes+referenceBytes;
    return {policy,catalogBytes,referenceBytes,usedBytes,places:Number(count?.places??0),
      expiredPlaces:Number(count?.expired??0),cleanupEligible:Number(count?.eligible??0),
      popularDue:Number(count?.popular_due??0),status:geoStorageLevel(usedBytes,policy)};
  }
  async updatePolicy(input:unknown):Promise<GeoStoragePolicy>{
    const x=parseGeoStoragePolicy(input);
    const {rows}=await this.pool.query<SettingsRow>(`
      UPDATE geo_storage_settings SET max_storage_mb=$1,alert_percent=$2,
        retention_days=$3,auto_cleanup_enabled=$4,updated_at=now() WHERE id=1 RETURNING *`,
      [x.maxStorageMb,x.alertPercent,x.retentionDays,x.autoCleanupEnabled]);
    if(!rows[0])throw new Error('GEO_STORAGE_SETTINGS_MISSING');
    return toPolicy(rows[0]);
  }
  async recordSelection(id:string):Promise<GeoCollectionRegion|null>{
    if(!id.startsWith('geo:'))return null;
    const {rows}=await this.pool.query<PointRow & {selection_count:string;age_days:number}>(`
      UPDATE geo_catalog_places SET selection_count=selection_count+1,
        last_selected_at=now() WHERE id=$1
      RETURNING latitude,longitude,selection_count::text,
        EXTRACT(EPOCH FROM (now()-updated_at))/86400 AS age_days`,[id]);
    const place=rows[0];
    if (!place || Number(place.selection_count)<3 || Number(place.age_days)<75) return null;
    return geoCollectionRegionForPoint(place.latitude,place.longitude);
  }
  async dueRegions():Promise<GeoCollectionRegion[]> {
    const {rows}=await this.pool.query<PointRow>(`
      SELECT latitude,longitude FROM geo_catalog_places
      WHERE source='osm' AND selection_count>=3 AND
        last_selected_at>=now()-interval '90 days' AND
        updated_at<now()-interval '75 days'
      ORDER BY selection_count DESC,updated_at ASC LIMIT 100`);
    return [...new Set(rows.map(row=>geoCollectionRegionForPoint(row.latitude,row.longitude))
      .filter((x):x is GeoCollectionRegion=>x!=null))];
  }
  async cleanup(input:{dryRun:boolean;automatic?:boolean;limit?:number}):
    Promise<{removed:number;eligible:number;dryRun:boolean;skipped?:string}>{
    const limit=Math.max(1,Math.min(200,Number.isInteger(input.limit)?input.limit!:100));
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const lock=await client.query<{ok:boolean}>('SELECT pg_try_advisory_xact_lock($1) AS ok',[67110921]);
      if(!lock.rows[0]?.ok){
        await client.query('ROLLBACK');
        return {removed:0,eligible:0,dryRun:input.dryRun,skipped:'busy'};
      }
      const {rows}=await client.query<SettingsRow>('SELECT * FROM geo_storage_settings WHERE id=1 FOR UPDATE');
      const policy=rows[0];
      if(!policy){await client.query('ROLLBACK');throw new Error('GEO_STORAGE_SETTINGS_MISSING');}
      if(input.automatic && (!policy.auto_cleanup_enabled ||
        policy.last_cleanup_at!=null &&
          Date.now()-new Date(policy.last_cleanup_at).getTime()<dayMs)) {
        await client.query('ROLLBACK');
        return {removed:0,eligible:0,dryRun:input.dryRun,skipped:'disabled_or_recent'};
      }
      const candidateClause=`source='osm' AND updated_at<now()-($1::integer * interval '1 day')
        AND (last_selected_at IS NULL OR last_selected_at<now()-interval '90 days')`;
      const candidates=await client.query<{count:string}>(`
        SELECT count(*)::text AS count FROM geo_catalog_places WHERE ${candidateClause}`,
        [policy.retention_days]);
      const eligible=Number(candidates.rows[0]?.count??0);
      if(input.dryRun){
        await client.query('ROLLBACK');
        return {removed:0,eligible,dryRun:true};
      }
      const deleted=await client.query<{id:string}>(`
        DELETE FROM geo_catalog_places WHERE id IN (
          SELECT id FROM geo_catalog_places WHERE ${candidateClause}
          ORDER BY updated_at ASC LIMIT $2 FOR UPDATE SKIP LOCKED
        ) RETURNING id`,[policy.retention_days,limit]);
      await client.query('UPDATE geo_storage_settings SET last_cleanup_at=now() WHERE id=1');
      await client.query('COMMIT');
      return {removed:deleted.rowCount??0,eligible,dryRun:false};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}

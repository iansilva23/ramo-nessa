import type { Pool } from 'pg';
import type { GeoCatalogRepository, GeoPlaceInput } from './geo-catalog-repository.js';
import type { GeoCollectionRegion } from './geo-collect-service.js';

export interface LearningRegionStatus {
  region: GeoCollectionRegion;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string | null;
  nextAllowedAt: string;
  totalImported: number;
  lastImported: number;
}
export interface PassengerGeoLearningStats {
  googlePlaceReferences: number;
  selectedGooglePlaces: number;
  regions: LearningRegionStatus[];
}
export interface PassengerGeoLearningStore {
  recordGooglePlaceId(placeId: string): Promise<void>;
  claim(region: GeoCollectionRegion, now: Date): Promise<boolean>;
  finish(region: GeoCollectionRegion, now: Date, added: number, success: boolean): Promise<void>;
  stats(): Promise<PassengerGeoLearningStats>;
}
const retryMilliseconds = 6 * 60 * 60 * 1000;
const refreshMilliseconds = 90 * 24 * 60 * 60 * 1000;
const runTimeoutMilliseconds = 30 * 60 * 1000;
const validId = (id: string) =>
  typeof id === 'string' && id.length >= 3 && id.length <= 256 &&
  !/[\u0000-\u001f\u007f]/.test(id) && !id.startsWith('geo:');
function assertGooglePlaceId(id: string) {
  if (!validId(id)) throw new Error('GEO_LEARNING_INVALID_GOOGLE_PLACE_ID');
}
export class InMemoryPassengerGeoLearningStore implements PassengerGeoLearningStore {
  private readonly ids = new Map<string, number>();
  private readonly regions = new Map<GeoCollectionRegion,LearningRegionStatus>();
  async recordGooglePlaceId(id: string) {
    assertGooglePlaceId(id);
    this.ids.set(id,(this.ids.get(id)??0)+1);
  }
  async claim(region: GeoCollectionRegion, now: Date) {
    if (!(['prea','jeri','jijoca'] as string[]).includes(region)) return false;
    const old=this.regions.get(region);
    if (old && Date.parse(old.nextAllowedAt)>now.getTime()) return false;
    this.regions.set(region,{
      region,status:'running',startedAt:now.toISOString(),completedAt:null,
      nextAllowedAt:new Date(now.getTime()+runTimeoutMilliseconds).toISOString(),
      totalImported:old?.totalImported??0,lastImported:old?.lastImported??0,
    });
    return true;
  }
  async finish(region:GeoCollectionRegion,now:Date,added:number,success:boolean) {
    const old=this.regions.get(region);
    if (!old || old.status!=='running') return;
    this.regions.set(region,{...old,status:success?'succeeded':'failed',
      completedAt:now.toISOString(),lastImported:added,
      totalImported:old.totalImported+added,
      nextAllowedAt:new Date(now.getTime()+(success?refreshMilliseconds:retryMilliseconds)).toISOString()});
  }
  async stats(): Promise<PassengerGeoLearningStats> {
    return {googlePlaceReferences:this.ids.size,
      selectedGooglePlaces:[...this.ids.values()].reduce((a,b)=>a+b,0),
      regions:[...this.regions.values()].sort((a,b)=>a.region.localeCompare(b.region))};
  }
}
type RegionRow={region:GeoCollectionRegion;status:LearningRegionStatus['status'];
  started_at:Date|string;completed_at:Date|string|null;next_allowed_at:Date|string;
  total_imported:string|number;last_imported:number};
const iso=(value:Date|string)=>new Date(value).toISOString();
function rowToStatus(row:RegionRow):LearningRegionStatus {
  return {region:row.region,status:row.status,startedAt:iso(row.started_at),
    completedAt:row.completed_at==null?null:iso(row.completed_at),
    nextAllowedAt:iso(row.next_allowed_at),totalImported:Number(row.total_imported),
    lastImported:Number(row.last_imported)};
}
export class PostgresPassengerGeoLearningStore implements PassengerGeoLearningStore {
  constructor(private readonly pool:Pool){}
  async recordGooglePlaceId(placeId:string) {
    assertGooglePlaceId(placeId);
    await this.pool.query(`INSERT INTO geo_passenger_place_references(place_id)
      VALUES($1) ON CONFLICT(place_id) DO UPDATE SET
      selections=geo_passenger_place_references.selections+1,last_selected_at=now()`,
    [placeId]);
  }
  async claim(region:GeoCollectionRegion,now:Date) {
    if (!(['prea','jeri','jijoca'] as string[]).includes(region)) return false;
    // Atomic cross-process lease. A crash can be retried after 30 minutes.
    const {rowCount}=await this.pool.query(`
      INSERT INTO geo_passenger_learning_regions
        (region,status,started_at,completed_at,next_allowed_at)
      VALUES($1,'running',$2,null,$3)
      ON CONFLICT(region) DO UPDATE SET
        status='running',started_at=excluded.started_at,
        completed_at=null,next_allowed_at=excluded.next_allowed_at
      WHERE geo_passenger_learning_regions.next_allowed_at<=$2
      RETURNING region`,
      [region,now.toISOString(),new Date(now.getTime()+runTimeoutMilliseconds).toISOString()]);
    return (rowCount??0)>0;
  }
  async finish(region:GeoCollectionRegion,now:Date,added:number,success:boolean) {
    await this.pool.query(`UPDATE geo_passenger_learning_regions SET
      status=$2,completed_at=$3,last_imported=$4,
      total_imported=total_imported+$4,next_allowed_at=$5
      WHERE region=$1 AND status='running'`,
      [region,success?'succeeded':'failed',now.toISOString(),added,
        new Date(now.getTime()+(success?refreshMilliseconds:retryMilliseconds)).toISOString()]);
  }
  async stats():Promise<PassengerGeoLearningStats> {
    const [ids,regions]=await Promise.all([
      this.pool.query<{unique_count:string;total_count:string}>(`
        SELECT count(*)::text AS unique_count,
          coalesce(sum(selections),0)::text AS total_count
        FROM geo_passenger_place_references`),
      this.pool.query<RegionRow>(`
        SELECT * FROM geo_passenger_learning_regions ORDER BY region`),
    ]);
    return {googlePlaceReferences:Number(ids.rows[0]?.unique_count??0),
      selectedGooglePlaces:Number(ids.rows[0]?.total_count??0),
      regions:regions.rows.map(rowToStatus)};
  }
}

export type GeoRegionalCollector=(region:GeoCollectionRegion)=>
  Promise<{places:GeoPlaceInput[];truncated:boolean}>;
export type LearningEvent={provider:'google';placeId:string;region:GeoCollectionRegion|null};

export class PassengerGeoLearner {
  constructor(private readonly store:PassengerGeoLearningStore,
    private readonly catalog:GeoCatalogRepository,
    private readonly collector:GeoRegionalCollector,
    private readonly reportError:(error:unknown)=>void=()=>{}) {}

  // Call only after a successfully authenticated, selected Google place.
  // Its display name, address, coordinates and passenger identity NEVER enter this store.
  async observe(event:LearningEvent) {
    await this.store.recordGooglePlaceId(event.placeId);
    if (!event.region) return;
    if (!await this.store.claim(event.region,new Date())) return;
    let added=0;
    let success=false;
    try {
      const result=await this.collector(event.region);
      // An intentionally truncated source must not block the next refresh for 90 days.
      if (!result.truncated && result.places.length>0) {
        for (let i=0;i<result.places.length;i+=200) {
          const batch=result.places.slice(i,i+200);
          const response=await this.catalog.apply(batch);
          added+=response.added;
        }
        success=true;
      }
    } catch(error) {
      this.reportError(error);
    } finally {
      try {await this.store.finish(event.region,new Date(),added,success);}
      catch(error){this.reportError(error);}
    }
  }
}

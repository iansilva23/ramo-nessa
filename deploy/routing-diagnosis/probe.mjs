import {GoogleRoutesProvider} from '/app/dist/src/routing/google-routes-provider.js';
import {resolveRoutingTimeoutMs} from '/app/dist/src/config/runtime-config.js';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';

const statusNames = new Set(['PERMISSION_DENIED','RESOURCE_EXHAUSTED','INVALID_ARGUMENT',
  'UNAUTHENTICATED','UNAVAILABLE','DEADLINE_EXCEEDED','INTERNAL','NOT_FOUND','UNKNOWN']);
const valid = point => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
const point = (latitude, longitude) => latitude == null || longitude == null ? null :
  {latitude:Number(latitude),longitude:Number(longitude)};
function separation(a,b) {
  const r = Math.PI / 180;
  const n = Math.sin((b.latitude-a.latitude)*r/2)**2 + Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin((b.longitude-a.longitude)*r/2)**2;
  return Math.round(12742000*Math.asin(Math.min(1,Math.sqrt(n))));
}
export function classify(message, metadata) {
  if (metadata.googleStatus === 'PERMISSION_DENIED' || metadata.httpStatus === 403) return 'GOOGLE_PERMISSION_DENIED';
  if (metadata.googleStatus === 'RESOURCE_EXHAUSTED' || metadata.httpStatus === 429) return 'GOOGLE_QUOTA_OR_RATE_LIMIT';
  if (metadata.httpStatus === 401) return 'GOOGLE_AUTHENTICATION';
  if (/não respondeu a tempo/i.test(message)) return 'TIMEOUT_OR_NETWORK';
  if (/latitude|longitude|coordenada/i.test(message)) return 'INVALID_COORDINATES';
  if (metadata.httpStatus === 200 && metadata.routeCount === 0) return 'GOOGLE_NO_ROUTE';
  if (/distância roteada válida|distância inválida/i.test(message)) return 'INVALID_OR_MISSING_ROUTE_DISTANCE';
  if (metadata.httpStatus >= 400) return 'GOOGLE_HTTP_ERROR';
  return 'ROUTING_ERROR_UNCLASSIFIED';
}

async function main() {
  const out = {status:'ROUTING_DIAGNOSTIC_PROBE',configuration:{},database:{},probes:[]};
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  const endpoint = new URL(process.env.GOOGLE_ROUTES_BASE_URL?.trim() || 'https://routes.googleapis.com/');
  const timeoutMs = resolveRoutingTimeoutMs();
  const googleEndpoint = endpoint.origin === 'https://routes.googleapis.com'
    && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname === '/';
  out.configuration = {providerIsGoogle:(process.env.ROUTING_PROVIDER?.trim().toLowerCase() || 'google')==='google',
    keyConfigured:Boolean(apiKey),googleEndpoint,timeoutMs};
  let driver = null, pickup = null;
  const pool = createPostgresPool(process.env.DATABASE_URL);
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='5s'");
    const counts = await client.query(`SELECT count(*) FILTER(WHERE online)::int AS online,
      count(*) FILTER(WHERE online AND busy)::int AS busy,
      count(*) FILTER(WHERE online AND (latitude IS NULL OR longitude IS NULL OR latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180))::int AS invalid_online_points
      FROM driver_supply`);
    const supply = await client.query(`SELECT latitude,longitude,
      greatest(0,extract(epoch FROM now()-location_updated_at))::int AS age_seconds
      FROM driver_supply WHERE online AND NOT busy ORDER BY location_updated_at DESC LIMIT 1`);
    const last = await client.query(`SELECT pickup_latitude,pickup_longitude FROM rides
      WHERE pickup_latitude IS NOT NULL AND pickup_longitude IS NOT NULL ORDER BY created_at DESC LIMIT 1`);
    await client.query('COMMIT');
    const row = supply.rows[0], trip = last.rows[0];
    driver = row ? point(row.latitude,row.longitude) : null;
    pickup = trip ? point(trip.pickup_latitude,trip.pickup_longitude) : null;
    out.database = {status:'READ_ONLY_OK',...counts.rows[0],selectedDriverPointValid:Boolean(valid(driver)),
      selectedDriverLocationAgeSeconds:row?.age_seconds ?? null,lastSavedPickupValid:Boolean(valid(pickup))};
  } catch (error) {
    if(client) await client.query('ROLLBACK').catch(()=>{});
    out.database = {status:'READ_ONLY_QUERY_FAILED',code:/^[A-Z0-9]{5}$/.test(error.code || '')?error.code:null};
  } finally {
    client?.release();
    await pool.end();
  }
  if (!googleEndpoint || !apiKey || !out.configuration.providerIsGoogle) {
    out.probesSkipped = 'PROVIDER_CONFIGURATION_NEEDS_REVIEW';
    console.log(JSON.stringify(out)); return;
  }
  const cases = [{name:'road_control_sample',from:{latitude:-2.82017,longitude:-40.41467},to:{latitude:-2.8986,longitude:-40.4506}}];
  if (valid(driver) && valid(pickup)) cases.push({name:'online_driver_to_last_saved_pickup_sample',from:driver,to:pickup});
  if (valid(driver)) {
    const near = {latitude:driver.latitude+0.00004,longitude:driver.longitude};
    if(valid(near)) cases.push({name:'online_driver_nearby_4m_sample',from:driver,to:near});
  }
  let externalRequests = 0;
  for (const item of cases.slice(0,3)) {
    const result = {name:item.name,inputSeparationMeters:separation(item.from,item.to)};
    const fetcher = async (url, options) => {
      const target = new URL(url);
      if(target.origin !== 'https://routes.googleapis.com' || target.pathname !== '/directions/v2:computeRoutes') throw Error('Unexpected endpoint');
      if(++externalRequests > 3) throw Error('Diagnostic request bound exceeded');
      const response = await fetch(url,{...options,redirect:'error'});
      result.httpStatus = response.status;
      try {
        const json = await response.clone().json();
        if(statusNames.has(json.error?.status)) result.googleStatus = json.error.status;
        const reasons = (json.error?.details || []).map(d=>d.reason).filter(v=>typeof v==='string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(v));
        if(reasons.length) result.googleReasons = reasons.slice(0,4);
        if(response.ok) result.routeCount = Array.isArray(json.routes)?json.routes.length:0;
        result.billingMentioned = /billing|faturamento/i.test(json.error?.message || '');
        result.apiDisabledMentioned = /not enabled|disabled|não.*ativad/i.test(json.error?.message || '');
      } catch {result.responseJsonInvalid=true;}
      return response;
    };
    const provider = new GoogleRoutesProvider(apiKey,endpoint.toString(),timeoutMs,fetcher);
    const started = Date.now();
    try {
      const km = await provider.routeDistanceKm(item);
      result.outcome = 'OK';result.distanceValid=Number.isFinite(km)&&km>=0;
      result.externalCallSkipped=externalRequests===0 || result.httpStatus==null;
    } catch(error) {result.outcome=classify(String(error.message || ''),result);}
    result.elapsedMs=Date.now()-started;
    out.probes.push(result);
    if(['GOOGLE_PERMISSION_DENIED','GOOGLE_QUOTA_OR_RATE_LIMIT','GOOGLE_AUTHENTICATION'].includes(result.outcome)) break;
  }
  out.externalRequests = externalRequests;
  out.scope='Samples only; failed request coordinates are not logged. No ride or payment created.';
  console.log(JSON.stringify(out));
}

main().catch(()=>console.log(JSON.stringify({status:'ROUTING_DIAGNOSTIC_PROBE_FAILED'})));

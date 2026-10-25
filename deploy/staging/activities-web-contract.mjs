import {isDeepStrictEqual} from 'node:util';
export const activitiesSource='c05e3b82949ab22963ac9018b3834d8e7c46060d';
export const activitiesBase='25d429e11b282be8832538ebd11d41123526fd5a';
export const baselineCore='591fa41486d42bcc68ee2f4f3f625bd6d749e9869af75afcb811c6c28ea8562e';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveWeb='/opt/ramo-nessa-web/releases/ride-identity-e36963c02716/bundles';
export const activitiesWeb='/opt/ramo-nessa-web/releases/activities-'+activitiesSource.slice(0,12)+'/bundles';
export const activitiesRoot='/opt/ramo-nessa-ride-activities-web';
export const activitiesDirectory=activitiesRoot+'/'+activitiesSource.slice(0,12);
export const coreDelta=["admin/admin-driver-document-compliance-service.js","db/repositories.js","drivers/document-expiry.js","drivers/driver-document-service.js","drivers/driver-document-validation.js","drivers/driver-operational-eligibility.js","drivers/driver-ride-service.js","drivers/driver-self-service.js","drivers/driver-support-service.js","drivers/repositories/in-memory-driver-document-repository.js","drivers/repositories/in-memory-driver-support-repository.js","drivers/repositories/postgres-driver-document-repository.js","drivers/repositories/postgres-driver-support-repository.js","rides/boarding-routes.js","rides/boarding-store.js","rides/passenger-activity-service.js","rides/repositories/in-memory-ride-repository.js","rides/repositories/postgres-ride-repository.js","rides/ride-resumption.js","rides/ride-support-context.js","server.js"];
export const adminDelta=["pages/drivers.html","pages/support.html","src/api.js","src/app.js","src/boarding-admin.js","src/support-ride-context.js"];
export const migrations=[{"filename":"094_ride_boarding_recovery.sql","checksum":"9b2579f40aabf2ed9b71c2ce83fe964d9d6ae5f8710c3c295a0491f200e37b8c"},{"filename":"095_ride_activity_support.sql","checksum":"314d46d150953d3e95a2f5696436d25bc17edf1068031b9317e3a7bc5c0212e6"}];
export function assertActivitiesManifest(m){
 if(m.format!==1||m.source!==activitiesSource||m.baseline!==activitiesBase||m.baselineCore!==baselineCore||!isDeepStrictEqual(m.migrations,migrations)||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta)||m.candidateCore!=='e9fec104fd505a3909ed9233224c2384dcdd414d2cc0cc41a42d42b9a54d9697')throw Error('ACTIVITIES_PACKAGE_PROVENANCE');
 const old=new Map(m.baselineAdmin),next=new Map(m.candidateAdmin);
 if(!isDeepStrictEqual([...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).sort(),adminDelta))throw Error('ACTIVITIES_ADMIN_DELTA');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),...migrations.map(m=>'migration/'+m.filename)];
 const payload=m.files?.map(f=>f.path).sort();
 if(!payload||payload.some(p=>!(/^(passenger|driver)\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!payload.includes(p))||new Set(payload).size!==payload.length||(!payload.includes('passenger/main.dart.js')||!payload.includes('driver/main.dart.js'))||payload.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('ACTIVITIES_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('ACTIVITIES_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|admin-workspace.css|manual-refunds.css|company-dashboard.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('ACTIVITIES_ADMIN_MANIFEST');
 if(!Array.isArray(m.baselineMigrations)||!m.baselineMigrations.length||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('ACTIVITIES_MIGRATION_MANIFEST');
}
export function assertActivitiesGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('ACTIVITIES_WEB_MOUNT');roots[0].source=web;
 if(!isDeepStrictEqual(expected,after))throw Error('ACTIVITIES_GATEWAY_OPTIONS_CHANGED');
}

export const inspectedWebFiles={};
export const inspectedCaddy='23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46';

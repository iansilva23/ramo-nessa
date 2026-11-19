import {isDeepStrictEqual} from 'node:util';
export const consistencySource='3c5fa5e5ab635fac7654895d5a4bd6909cd6360a';
export const consistencyBase='c05e3b82949ab22963ac9018b3834d8e7c46060d';
export const baselineCore='e9fec104fd505a3909ed9233224c2384dcdd414d2cc0cc41a42d42b9a54d9697';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveWeb='/opt/ramo-nessa-web/releases/driver-cinema-d8ddfb102f88/bundles';
export const consistencyWeb='/opt/ramo-nessa-web/releases/consistency-'+consistencySource.slice(0,12)+'/bundles';
export const consistencyRoot='/opt/ramo-nessa-ride-consistency-web';
export const consistencyDirectory=consistencyRoot+'/'+consistencySource.slice(0,12);
export const coreDelta=["db/repositories.js","drivers/driver-app-service.js","drivers/driver-finance-service.js","drivers/driver-ride-service.js","drivers/driver-self-service.js","matching/dispatch-next-driver.js","matching/in-memory-ride-matching-repository.js","matching/postgres-ride-matching-repository.js","payments/create-payment.js","payments/ledger.js","payments/repositories/in-memory-finance-repository.js","payments/repositories/postgres-finance-repository.js","payments/settlement.js","promotions/promotion-service.js","rides/confirm-payment.js","rides/manual-cancellation-routes.js","rides/manual-cancellation-store.js","rides/occurrence-bonus.js","rides/passenger-activity-service.js","rides/passenger-ride-tracking.js","rides/passenger-ride-view.js","rides/repositories/in-memory-ride-repository.js","rides/repositories/postgres-ride-repository.js","rides/ride-checkout-presentation.js","rides/ride-occurrence-routes.js","rides/ride-occurrence-store.js","rides/ride-resumption.js","rides/ride-state.js","rides/ride-support-context.js","routing/google-routes-provider.js","server.js"];
export const adminDelta=["src/api.js","src/app.js","src/ride-occurrences-admin.js"];
export const migrations=[{"filename":"096_ride_cancellation_identity.sql","checksum":"a628055da767036c3e29ad1798c5cca884c1ff22e44f8943ff39719fcc8b3c23"},{"filename":"097_ride_occurrences.sql","checksum":"b46eb4aa822cfa0d1e1ba9715d647482dbac05773d14c1747e7c21c058783266"}];
export function assertConsistencyManifest(m){
 if(m.format!==1||m.source!==consistencySource||m.baseline!==consistencyBase||m.baselineCore!==baselineCore||!isDeepStrictEqual(m.migrations,migrations)||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta)||m.candidateCore!=='4ebf6343814b1af12a207074ad1a9530ac4052abff432ea861438ea2f3a70fe7')throw Error('CONSISTENCY_PACKAGE_PROVENANCE');
 const old=new Map(m.baselineAdmin),next=new Map(m.candidateAdmin);
 if(!isDeepStrictEqual([...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).sort(),adminDelta))throw Error('CONSISTENCY_ADMIN_DELTA');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),...migrations.map(m=>'migration/'+m.filename)];
 const payload=m.files?.map(f=>f.path).sort();
 if(!payload||payload.some(p=>!(/^(passenger|driver)\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!payload.includes(p))||new Set(payload).size!==payload.length||(!payload.includes('passenger/main.dart.js')||!payload.includes('driver/main.dart.js'))||payload.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('CONSISTENCY_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('CONSISTENCY_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|admin-workspace.css|manual-refunds.css|company-dashboard.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('CONSISTENCY_ADMIN_MANIFEST');
 if(!Array.isArray(m.baselineMigrations)||!m.baselineMigrations.length||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('CONSISTENCY_MIGRATION_MANIFEST');
}
export function assertConsistencyGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('CONSISTENCY_WEB_MOUNT');roots[0].source=web;
 if(!isDeepStrictEqual(expected,after))throw Error('CONSISTENCY_GATEWAY_OPTIONS_CHANGED');
}

export const inspectedWebFiles={};
export const inspectedCaddy='23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46';


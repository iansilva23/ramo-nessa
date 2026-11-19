import {isDeepStrictEqual} from 'node:util';
export const polishSource='5f51e1f7b9fd714ded24801afb034de0c292f2fd';
export const polishBase='2e0c61cc273ee276c03a4670bf2fa57573f900be';
export const baselineCore='4ebf6343814b1af12a207074ad1a9530ac4052abff432ea861438ea2f3a70fe7';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveWeb='/opt/ramo-nessa-web/releases/consistency-3c5fa5e5ab63/bundles';
export const polishWeb='/opt/ramo-nessa-web/releases/polish-'+polishSource.slice(0,12)+'/bundles';
export const polishRoot='/opt/ramo-nessa-passenger-polish-web';
export const polishDirectory=polishRoot+'/'+polishSource.slice(0,12);
export const coreDelta=["drivers/driver-app-service.js","drivers/driver-ride-service.js","drivers/driver-self-service.js","matching/postgres-ride-matching-repository.js","notifications/push-delivery-provider.js","rides/passenger-activity-service.js","rides/passenger-ride-tracking.js","rides/postgres-ride-preparation-repository.js","rides/prepare-ride.js","rides/repositories/postgres-ride-repository.js","rides/validation.js","server.js"];
export const adminDelta=["src/app.js"];
export const migrations=[{"filename":"098_ride_place_labels.sql","checksum":"33de12d5e877d8cb59794f23098260abacbd22156058338e41d12fd3e012756a"}];
export function assertPolishManifest(m){
 if(m.format!==1||m.source!==polishSource||m.baseline!==polishBase||m.baselineCore!==baselineCore||!isDeepStrictEqual(m.migrations,migrations)||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta)||m.candidateCore!=='c877a82fc032f71e0cb5c6ec48684b617d857095d9381fdb3aab7802945e02bf')throw Error('POLISH_PACKAGE_PROVENANCE');
 const old=new Map(m.baselineAdmin),next=new Map(m.candidateAdmin);
 if(!isDeepStrictEqual([...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).sort(),adminDelta))throw Error('POLISH_ADMIN_DELTA');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),...migrations.map(m=>'migration/'+m.filename)];
 const payload=m.files?.map(f=>f.path).sort();
 if(!payload||payload.some(p=>!(/^(passenger|driver)\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!payload.includes(p))||new Set(payload).size!==payload.length||(!payload.includes('passenger/main.dart.js')||!payload.includes('driver/main.dart.js'))||payload.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('POLISH_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('POLISH_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|admin-workspace.css|manual-refunds.css|company-dashboard.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('POLISH_ADMIN_MANIFEST');
 if(!Array.isArray(m.baselineMigrations)||!m.baselineMigrations.length||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('POLISH_MIGRATION_MANIFEST');
}
export function assertPolishGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('POLISH_WEB_MOUNT');roots[0].source=web;
 if(!isDeepStrictEqual(expected,after))throw Error('POLISH_GATEWAY_OPTIONS_CHANGED');
}

export const inspectedWebFiles={};
export const inspectedCaddy='23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46';


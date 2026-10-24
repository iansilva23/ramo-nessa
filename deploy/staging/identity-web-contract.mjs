import {isDeepStrictEqual} from 'node:util';
export const identitySource="e36963c02716511da855f89a529175da04b51eff";
export const identityBase="9ccd91e0c8dfd69eb5401a86b7c91975ba0d454c";
export const baselineCore="2f72d13b2ea6b198f85f05e56da9fef400cfe8f1090c759ea4ffbd5ad1bcdbce";
export const candidateCore="15438b314c7aa4d8a1eeba1da025602f2162c88f636974de6748bb4d95684249";
export const dependencyLock="3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e";
export const liveWeb="/opt/ramo-nessa-web/releases/nearby-9ccd91e0c8df/bundles";
export const identityRoot="/opt/ramo-nessa-ride-identity-manual-web";
export const coreDelta=["db/repositories.js","drivers/driver-finance-service.js","payments/repositories/postgres-finance-repository.js","rides/automatic-ride-refund-service.js","rides/manual-cancellation-policy.js","rides/manual-cancellation-routes.js","rides/manual-cancellation-store.js","rides/passenger-ride-tracking.js","rides/refund-external-no-driver.js","rides/refund-no-driver.js","rides/repositories/postgres-ride-repository.js","server.js"];
export const adminDelta=["index.html","manual-refunds.css","pages/finance.html","src/api.js","src/app.js","src/manual-refunds-admin.js"];
export const migration="091_manual_ride_cancellations.sql";
export const migrations=[migration,'092_manual_cancellation_switch.sql'];
export const inspectedWebFiles={"driver/index.html":"51e7dbc5b2a749355d0d7a2705604139f9d7ccd78067a00284653618c34eba43","driver/main.dart.js":"d07970aed569c2a6ca41dec5628c31649107adc32ee7e8c3f993e5b75a94aa43","passenger/main.dart.js":"ca61958d708ee6b8d9213d276b4aab6c6803d9188610e86b55f5fcb02880cf44","passenger/index.html":"150de3db2702ad67d65b527c3f2315a718153f431918a7f14ecf14246f8f4705"};
export const inspectedCaddy="23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46";
export const identityWeb='/opt/ramo-nessa-web/releases/ride-identity-'+identitySource.slice(0,12)+'/bundles';
export const identityDirectory=identityRoot+'/'+identitySource.slice(0,12);
export function assertIdentityManifest(m){
 if(m.format!==1||m.source!==identitySource||m.baseline!==identityBase||m.baselineCore!==baselineCore||m.candidateCore!==candidateCore||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta))throw Error('IDENTITY_PACKAGE_PROVENANCE');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),...migrations.map(p=>'migration/'+p)];
 const paths=m.files?.map(f=>f.path).sort();
 if(!paths||paths.some(p=>!(/^(driver|passenger)\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!paths.includes(p))||new Set(paths).size!==paths.length||!['driver','passenger'].every(r=>paths.includes(r+'/main.dart.js'))||paths.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('IDENTITY_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('IDENTITY_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|admin-workspace.css|manual-refunds.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('IDENTITY_ADMIN_MANIFEST');
 const old=new Map(m.baselineAdmin),next=new Map(m.candidateAdmin);
 if(!isDeepStrictEqual([...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).sort(),adminDelta))throw Error('IDENTITY_ADMIN_DELTA');
 if(!Array.isArray(m.baselineMigrations)||m.baselineMigrations.length!==92||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('IDENTITY_MIGRATION_MANIFEST');
}
export function assertIdentityGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('IDENTITY_WEB_MOUNT');roots[0].source=web;
 if(!isDeepStrictEqual(expected,after))throw Error('IDENTITY_GATEWAY_OPTIONS_CHANGED');
}

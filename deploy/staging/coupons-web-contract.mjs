import {isDeepStrictEqual} from 'node:util';
export const economySource='2fc82e5dfd0a2ccd958be088ed11970b262c6f15';
export const economyBase='f8417a6e6e59a11fee4b498c08ce42eaa167f716';
export const baselineCore='79b9e66bf1f67d6489fd3e9d35e814cf77d26efbcbac517b2d508841e1b0c26f';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export let liveWeb='/opt/ramo-nessa-web/releases/guide-menu-7984d449122e/bundles';
export function selectLiveWeb(path){
 if(!['/opt/ramo-nessa-web/releases/guide-menu-7984d449122e/bundles','/opt/ramo-nessa-web/releases/driver-follow-a04302a475f9/bundles'].includes(path))throw Error('COUPONS_WEB_BASE_CHANGED');
 liveWeb=path;
}
export const economyWeb='/opt/ramo-nessa-web/releases/coupons-'+economySource.slice(0,12)+'/bundles';
export const economyRoot='/opt/ramo-nessa-sponsored-coupons';
export const economyDirectory=economyRoot+'/'+economySource.slice(0,12);
export const coreDelta=["admin/admin-promotions-service.js", "drivers/driver-app-service.js", "drivers/driver-ride-service.js", "promotions/promotion-presentation.js", "promotions/promotion-repository.js", "promotions/promotion-service.js", "promotions/repositories/in-memory-promotion-repository.js", "promotions/repositories/postgres-promotion-repository.js", "server.js"];
export const adminDelta=["pages/coupons.html", "src/api.js", "src/promotions-admin.js"];
export const migrations=[{"filename": "100_sponsored_coupon_presentation.sql", "checksum": "bd257526254245790f0ce52ba47dac65fd341662c4b10c441e3d798b5e2ed4ea"}];
export function assertEconomyManifest(m){
 if(m.format!==1||m.source!==economySource||m.baseline!==economyBase||m.baselineCore!==baselineCore||!isDeepStrictEqual(m.migrations,migrations)||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta)||m.candidateCore!=='4161f7ed589d0437a62ad8d8fc54db96ed4e1b93cb390a1ddca87a666db39353')throw Error('ECONOMY_PACKAGE_PROVENANCE');
 const old=new Map(m.baselineAdmin),next=new Map(m.candidateAdmin);
 if(!isDeepStrictEqual([...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).sort(),adminDelta))throw Error('ECONOMY_ADMIN_DELTA');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),...migrations.map(m=>'migration/'+m.filename)];
 const payload=m.files?.map(f=>f.path).sort();
 if(!payload||payload.some(p=>!(/^(driver|passenger)\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!payload.includes(p))||new Set(payload).size!==payload.length||!payload.includes('driver/main.dart.js')||!payload.includes('passenger/main.dart.js')||payload.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('ECONOMY_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('ECONOMY_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|admin-workspace.css|manual-refunds.css|company-dashboard.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('ECONOMY_ADMIN_MANIFEST');
 if(!Array.isArray(m.baselineMigrations)||!m.baselineMigrations.length||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('ECONOMY_MIGRATION_MANIFEST');
}
export function assertEconomyGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('ECONOMY_WEB_MOUNT');roots[0].source=web;
 if(!isDeepStrictEqual(expected,after))throw Error('ECONOMY_GATEWAY_OPTIONS_CHANGED');
}

export const inspectedWebFiles={};
export const inspectedCaddy='23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46';


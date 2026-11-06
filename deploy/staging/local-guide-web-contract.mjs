import {isDeepStrictEqual} from 'node:util';
export const guideSource='9f294f81fe6dad56ffd46edf0482ab947347c36a';
export const guideBase='731d524d55ecfab945605c00611abd067bc955c5';
export const baselineCore='28d8faa762d6da73c3a7bf0fa26f1fbe6e653cf9aa202be7c268d9f45aba5509';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveCore='sha256:8020dd70b5aeb81ddd857f28293c475cc50f6d4708588a8963d7d20223b462be';
export const liveGateway='sha256:72c5f3b8fb7152673823fa968bf0d79e623805b2449d5faab3d78b7c8afd8cd6';
export const liveWeb='/opt/ramo-nessa-web/releases/direct-2c8963b2a0a6/bundles';
export const guideWeb='/opt/ramo-nessa-web/releases/guide-'+guideSource.slice(0,12)+'/bundles';
export const guideRoot='/opt/ramo-nessa-local-guide';
export const guideDirectory=guideRoot+'/'+guideSource.slice(0,12);
export const liveCatalog='d8da5c2a75ec88780de1226063ca08b563bf2b9d38004e012936b97d9b191b30';
export const coreDelta=['db/repositories.js','guide/guide-routes.js','guide/guide-store.js','guide/guide.js','server.js'];
export const adminDelta=['guide.css','index.html','pages/guide.html','src/api.js','src/app.js','src/guide-admin.js','src/guide-model.js'];
export const migration='087_local_guide.sql';
export function assertGuideManifest(m){
 if(m.format!==1||m.source!==guideSource||m.baseline!==guideBase||m.baselineCore!==baselineCore||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta)||!/^[a-f0-9]{64}$/.test(m.candidateCore??''))throw Error('GUIDE_PACKAGE_PROVENANCE');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),'migration/'+migration];
 const payload=m.files?.map(f=>f.path).sort();
 if(!payload||payload.some(p=>!(/^passenger\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!payload.includes(p))||new Set(payload).size!==payload.length||!payload.includes('passenger/main.dart.js')||payload.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('GUIDE_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('GUIDE_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('GUIDE_ADMIN_MANIFEST');
 if(!Array.isArray(m.baselineMigrations)||!m.baselineMigrations.length||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('GUIDE_MIGRATION_MANIFEST');
}
export function assertGuideGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('GUIDE_WEB_MOUNT');roots[0].source=web;
 if(!isDeepStrictEqual(expected,after))throw Error('GUIDE_GATEWAY_OPTIONS_CHANGED');
}

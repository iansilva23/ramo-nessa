import {isDeepStrictEqual} from 'node:util';
export const ratingSource='8af62ee4b103d1433510605b0dd4ea66b2d8cb83';
export const ratingBase='75ca2b7c3d9a97cfaa6f48a3748c2f12867a19f1';
export const baselineCore='8ae023ae3fc135fd535112ac2e2149f7d639c52b3b3d73e588055d8f06866dfb';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveGateway='sha256:7b3a5eaf7089157f5b57e943a45526bb4da79bcb29fcf7ef8dad370ba657d10b';
export const liveWeb='/opt/ramo-nessa-web/releases/chat-75ca2b7c3d9a/bundles';
export const ratingWeb='/opt/ramo-nessa-web/releases/passenger-rating-'+ratingSource.slice(0,12)+'/bundles';
export const ratingRoot='/opt/ramo-nessa-passenger-rating-web';
export const ratingDirectory=ratingRoot+'/'+ratingSource.slice(0,12);
export const coreDelta=['rides/passenger-rating-routes.js','rides/repositories/in-memory-ride-repository.js','rides/repositories/postgres-ride-repository.js','server.js'];
export const adminDelta=[];
export const migration='090_passenger_ratings.sql';
export function assertRatingManifest(m){
 if(m.format!==1||m.source!==ratingSource||m.baseline!==ratingBase||m.baselineCore!==baselineCore||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta)||m.candidateCore!=='4bf28bfb9028347dcb5a6be7799b5c56a648726e8c133db1940507c6a5da590e')throw Error('RATING_PACKAGE_PROVENANCE');
 if(!isDeepStrictEqual(m.baselineAdmin,m.candidateAdmin))throw Error('RATING_ADMIN_CHANGED');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),'migration/'+migration];
 const payload=m.files?.map(f=>f.path).sort();
 if(!payload||payload.some(p=>!(/^driver\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!payload.includes(p))||new Set(payload).size!==payload.length||!payload.includes('driver/main.dart.js')||payload.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('RATING_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('RATING_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('RATING_ADMIN_MANIFEST');
 if(!Array.isArray(m.baselineMigrations)||!m.baselineMigrations.length||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('RATING_MIGRATION_MANIFEST');
}
export function assertRatingGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('RATING_WEB_MOUNT');roots[0].source=web;
 if(newImage!==before.services.gateway.image)throw Error('RATING_GATEWAY_IMAGE_CHANGED');
 if(!isDeepStrictEqual(expected,after))throw Error('RATING_GATEWAY_OPTIONS_CHANGED');
}

export const inspectedWebFiles={
 'driver/main.dart.js':'127c1a931de66c6f85650402739cc8b669103b27432e3fee5a1965e1273a9920',
 'driver/index.html':'51e7dbc5b2a749355d0d7a2705604139f9d7ccd78067a00284653618c34eba43',
 'passenger/main.dart.js':'63785c41b312f6c3c95a44db2c931967b1be723949b9e2f9f9276bbb46d34ad6',
 'passenger/index.html':'150de3db2702ad67d65b527c3f2315a718153f431918a7f14ecf14246f8f4705',
};
export const inspectedCaddy='23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46';

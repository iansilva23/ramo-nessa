import {isDeepStrictEqual} from 'node:util';
export const nearbySource='9ccd91e0c8dfd69eb5401a86b7c91975ba0d454c';
export const nearbyBase='ec4bc00d6ffd8d3d5708fdd97a49f3d2e18ddb25';
export const baselineCore='13ad9d9c249888b2c58304bb71093b85a9562c00126b884b4572c69098dd9575';
export const candidateCore='2f72d13b2ea6b198f85f05e56da9fef400cfe8f1090c759ea4ffbd5ad1bcdbce';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveWeb='/opt/ramo-nessa-web/releases/passenger-rating-8af62ee4b103/bundles';
export const nearbyWeb='/opt/ramo-nessa-web/releases/nearby-'+nearbySource.slice(0,12)+'/bundles';
export const nearbyRoot='/opt/ramo-nessa-passenger-nearby-web';
export const nearbyDirectory=nearbyRoot+'/'+nearbySource.slice(0,12);
export const coreDelta=['drivers/passenger-nearby-service.js','server.js'];
export const adminDelta=[];
export function assertNearbyManifest(m){
 if(m.format!==1||m.source!==nearbySource||m.baseline!==nearbyBase||m.baselineCore!==baselineCore||m.candidateCore!==candidateCore||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta))throw Error('NEARBY_PACKAGE_PROVENANCE');
 if(!isDeepStrictEqual(m.baselineAdmin,m.candidateAdmin))throw Error('NEARBY_ADMIN_CHANGED');
 const expected=coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']);
 const paths=m.files?.map(f=>f.path).sort();
 if(!paths||paths.some(p=>!(/^passenger\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!paths.includes(p))||new Set(paths).size!==paths.length||!paths.includes('passenger/main.dart.js')||paths.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('NEARBY_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('NEARBY_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|admin-workspace.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('NEARBY_ADMIN_MANIFEST');
}
export function assertNearbyGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before),roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('NEARBY_WEB_MOUNT');roots[0].source=web;
 if(newImage!==before.services.gateway.image||!isDeepStrictEqual(expected,after))throw Error('NEARBY_GATEWAY_OPTIONS_CHANGED');
}
export const inspectedWebFiles={
 'passenger/main.dart.js':'63785c41b312f6c3c95a44db2c931967b1be723949b9e2f9f9276bbb46d34ad6',
 'passenger/index.html':'150de3db2702ad67d65b527c3f2315a718153f431918a7f14ecf14246f8f4705',
};
export const inspectedCaddy='23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46';

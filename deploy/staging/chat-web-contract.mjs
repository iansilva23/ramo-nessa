import {isDeepStrictEqual} from 'node:util';
export const chatSource='75ca2b7c3d9a97cfaa6f48a3748c2f12867a19f1';
export const chatBase='7fd822356f84c435d28c0c43b2bcbf585e306710';
export const baselineCore='f12e074fac62f344692b62cc98d078f2a93d4f4fb405b903d435ea6491a05d5c';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveCore='sha256:0ce73359ca20693a584b2a4ae1c20da170288066fae58f0667c07599d18bc519';
export const liveGateway='sha256:7b3a5eaf7089157f5b57e943a45526bb4da79bcb29fcf7ef8dad370ba657d10b';
export const liveWeb='/opt/ramo-nessa-web/releases/driver-ride-a13377253135/bundles';
export const chatWeb='/opt/ramo-nessa-web/releases/chat-'+chatSource.slice(0,12)+'/bundles';
export const chatRoot='/opt/ramo-nessa-ride-chat-web';
export const chatDirectory=chatRoot+'/'+chatSource.slice(0,12);
export const coreDelta=['rides/repositories/in-memory-ride-repository.js','rides/repositories/postgres-ride-repository.js','rides/ride-chat-routes.js','server.js'];
export const adminDelta=[];
export const migration='089_ride_chat_reads.sql';
export function assertChatManifest(m){
 if(m.format!==1||m.source!==chatSource||m.baseline!==chatBase||m.baselineCore!==baselineCore||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta)||m.candidateCore!=='8ae023ae3fc135fd535112ac2e2149f7d639c52b3b3d73e588055d8f06866dfb')throw Error('CHAT_PACKAGE_PROVENANCE');
 if(!isDeepStrictEqual(m.baselineAdmin,m.candidateAdmin))throw Error('CHAT_ADMIN_CHANGED');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),'migration/'+migration];
 const payload=m.files?.map(f=>f.path).sort();
 if(!payload||payload.some(p=>!(/^(passenger|driver)\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!payload.includes(p))||new Set(payload).size!==payload.length||(!payload.includes('passenger/main.dart.js')||!payload.includes('driver/main.dart.js'))||payload.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('CHAT_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('CHAT_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('CHAT_ADMIN_MANIFEST');
 if(!Array.isArray(m.baselineMigrations)||!m.baselineMigrations.length||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('CHAT_MIGRATION_MANIFEST');
}
export function assertChatGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('CHAT_WEB_MOUNT');roots[0].source=web;
 if(newImage!==before.services.gateway.image)throw Error('CHAT_GATEWAY_IMAGE_CHANGED');
 if(!isDeepStrictEqual(expected,after))throw Error('CHAT_GATEWAY_OPTIONS_CHANGED');
}

export const inspectedWebFiles={
 'driver/main.dart.js':'f9137f02cb6b71f0fa091b3f9535feca8f151d3390f1460bb34d1db5d3541baf',
 'driver/index.html':'51e7dbc5b2a749355d0d7a2705604139f9d7ccd78067a00284653618c34eba43',
 'passenger/main.dart.js':'6b8a48a68a1b6fe050b355f59e5a9afb6cc4ecb66d9c2214c79219edebf48bf6',
 'passenger/index.html':'150de3db2702ad67d65b527c3f2315a718153f431918a7f14ecf14246f8f4705',
};
export const inspectedCaddy='23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46';

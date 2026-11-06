import {isDeepStrictEqual} from 'node:util';
export const checkoutSource='032e973b552bcfad3208450630cbd5f9181ef2d1';
export const checkoutBase='e84e33da018375230bfaee26bf4c7ec633d9bf9d';
export const baselineCore='d01f2d7ff7eeec566de2577c56f226d2f51d43091f5dc7c399d86f913f9c4241';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveCore='sha256:6459a320df3e4f44630b11787d6a6ac1b9fab148434ff4d9a81f3b9b55d64d05';
export const liveGateway='sha256:774b326e9a1b93af512be0cd1e88a42ef9373ffa0bb043002dbd622f30138051';
export const liveWeb='/opt/ramo-nessa-web/releases/guide-9f294f81fe6d/bundles';
export const checkoutWeb='/opt/ramo-nessa-web/releases/checkout-'+checkoutSource.slice(0,12)+'/bundles';
export const checkoutRoot='/opt/ramo-nessa-checkout-window';
export const checkoutDirectory=checkoutRoot+'/'+checkoutSource.slice(0,12);
export const coreDelta=['matching/postgres-ride-matching-repository.js','payments/create-payment.js','payments/mercado-pago-payment-service.js','payments/wallet-services.js','promotions/promotion-service.js','rides/authorize-cash.js','rides/postgres-ride-preparation-repository.js','rides/prepare-ride.js','rides/repositories/postgres-ride-repository.js','rides/ride.js','server.js'];
export const adminDelta=['pages/drivers.html'];
export const migration='088_ride_payment_window.sql';
export function assertCheckoutManifest(m){
 if(m.format!==1||m.source!==checkoutSource||m.baseline!==checkoutBase||m.baselineCore!==baselineCore||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta)||!/^[a-f0-9]{64}$/.test(m.candidateCore??''))throw Error('CHECKOUT_PACKAGE_PROVENANCE');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),'migration/'+migration];
 const payload=m.files?.map(f=>f.path).sort();
 if(!payload||payload.some(p=>!(/^passenger\/[a-zA-Z0-9_./@+ -]+$/.test(p)||expected.includes(p)))||expected.some(p=>!payload.includes(p))||new Set(payload).size!==payload.length||!payload.includes('passenger/main.dart.js')||payload.some(p=>p.split('/').includes('..')||p.includes('//')))throw Error('CHECKOUT_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('CHECKOUT_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('CHECKOUT_ADMIN_MANIFEST');
 if(!Array.isArray(m.baselineMigrations)||!m.baselineMigrations.length||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('CHECKOUT_MIGRATION_MANIFEST');
}
export function assertCheckoutGatewayDelta(before,after,newImage,web){
 const expected=structuredClone(before);expected.services.gateway.image=newImage;
 const roots=expected.services.gateway.volumes.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('CHECKOUT_WEB_MOUNT');roots[0].source=web;
 if(!isDeepStrictEqual(expected,after))throw Error('CHECKOUT_GATEWAY_OPTIONS_CHANGED');
}

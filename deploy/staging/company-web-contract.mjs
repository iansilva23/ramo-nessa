import {isDeepStrictEqual} from 'node:util';
export const companySource='938157fc23711fce4bf539afadb3b75eb8c05178',companyBase='e36963c02716511da855f89a529175da04b51eff';
export const baselineCore='15438b314c7aa4d8a1eeba1da025602f2162c88f636974de6748bb4d95684249';
export const candidateCore='1c4a5cc1d3b3c643a1e458029b4446693399278602437b87df602222540896e5';
export const dependencyLock='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const liveWeb='/opt/ramo-nessa-web/releases/ride-identity-e36963c02716/bundles',companyWeb=liveWeb;
export const companyRoot='/opt/ramo-nessa-company-finance-web',companyDirectory=companyRoot+'/'+companySource.slice(0,12);
export const coreDelta=["costs/company-cost-repository.js","costs/company-costs.js","costs/company-management.js","db/repositories.js","server.js"],adminDelta=["company-dashboard.css","index.html","pages/costs.html","pages/finance.html","pages/staff.html","src/api.js","src/app.js","src/company-costs-admin.js","src/company-dashboard.js"],migrations=['093_company_management.sql'];
export const inspectedCaddy='23007273d7b9939333a91ff72419f1761adaf63f269433e0aa0eb8d9336eff46';
export function assertCompanyManifest(m){
 if(m.format!==1||m.source!==companySource||m.baseline!==companyBase||m.baselineCore!==baselineCore||m.candidateCore!==candidateCore||m.lock!==dependencyLock||!isDeepStrictEqual(m.coreDelta,coreDelta)||!isDeepStrictEqual(m.adminDelta,adminDelta))throw Error('COMPANY_PACKAGE_PROVENANCE');
 const expected=[...coreDelta.flatMap(p=>['core/dist/src/'+p,'core/dist/src/'+p+'.map']),...adminDelta.map(p=>'admin/'+p),...migrations.map(p=>'migration/'+p)].sort();
 if(!Array.isArray(m.files)||!isDeepStrictEqual(m.files.map(f=>f.path).sort(),expected))throw Error('COMPANY_PACKAGE_SCOPE');
 for(const f of m.files)if(!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>50*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('COMPANY_PACKAGE_FILE');
 for(const rows of [m.baselineAdmin,m.candidateAdmin])if(!Array.isArray(rows)||!rows.length||rows.some(r=>!Array.isArray(r)||r.length!==2||!(/^(index.html|styles.css|guide.css|admin-workspace.css|manual-refunds.css|company-dashboard.css|favicon.svg|src\/[a-zA-Z0-9_./-]+|pages\/[a-zA-Z0-9_./-]+)$/).test(r[0])||r[0].includes('..')||!/^[a-f0-9]{64}$/.test(r[1])))throw Error('COMPANY_ADMIN_MANIFEST');
 const old=new Map(m.baselineAdmin),next=new Map(m.candidateAdmin);
 if(!isDeepStrictEqual([...new Set([...old.keys(),...next.keys()])].filter(p=>old.get(p)!==next.get(p)).sort(),adminDelta))throw Error('COMPANY_ADMIN_DELTA');
 if(!Array.isArray(m.baselineMigrations)||m.baselineMigrations.length!==94||m.baselineMigrations.some(r=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(r.filename)||!/^[a-f0-9]{64}$/.test(r.checksum)))throw Error('COMPANY_MIGRATION_MANIFEST');
}
export function assertCompanyGatewayDelta(before,after,newImage){const expected=structuredClone(before);expected.services.gateway.image=newImage;if(!isDeepStrictEqual(expected,after))throw Error('COMPANY_GATEWAY_OPTIONS_CHANGED');}

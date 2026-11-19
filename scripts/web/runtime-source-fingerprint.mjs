// CI-only reference builder; reads a compiled checkout and prints hashes, never runtime configuration.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {coreSourceFingerprintProgram,gatewayFingerprintFiles} from '../../deploy/staging/inspect-regions-pricing.mjs';
const root=resolve(process.argv[2]??''),revision=process.argv[3];
if(!/^[a-f0-9]{40}$/.test(revision??''))throw Error('Immutable source revision required.');
const result=spawnSync(process.execPath,['--input-type=module','-e',coreSourceFingerprintProgram,
  join(root,'backend/core/dist/src'),join(root,'backend/core/package-lock.json')],{encoding:'utf8',timeout:15000});
if(result.error||result.status!==0)throw Error('Compiled source fingerprint failed.');
const core=JSON.parse(result.stdout);
const gateway=Object.fromEntries(gatewayFingerprintFiles.map(path=>[path,createHash('sha256').update(readFileSync(join(root,'apps/admin',path))).digest('hex')]));
console.log('RAMO_RUNTIME_REFERENCE:'+JSON.stringify({revision,core,gateway}));

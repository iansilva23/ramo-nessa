import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeModels,assertRuntime,environmentMap,identity} from './regions-activation-contract.mjs';
import {activationArguments} from './prepare-regions-activation.mjs';
const before={Name:'/ramo-nessa-staging-gateway-1',Image:'sha256:old',Config:{Env:['PATH=/bin','TOKEN=one$two$$three'],Labels:{'com.docker.compose.project':'ramo-nessa-staging','com.docker.compose.service':'gateway'},User:'',Entrypoint:['caddy'],Cmd:['run']},State:{Health:{Status:'healthy'}},HostConfig:{PortBindings:{'443/tcp':[{HostPort:'443'}]},ReadonlyRootfs:false,RestartPolicy:{Name:'unless-stopped'},CapDrop:['ALL']},Mounts:[{Type:'bind',Source:'/old/bundles',Destination:'/srv/web',RW:false},{Type:'volume',Name:'caddy-data',Source:'/vol/data',Destination:'/data',RW:true}],NetworkSettings:{Networks:{'staging-net':{Aliases:['gateway']}}}};
const oldImage={Id:'sha256:old',Config:{Env:['PATH=/bin']}};
const newImage={Id:'sha256:new',Config:{Env:['PATH=/bin']}};
const resolved={name:'ramo-nessa-staging',services:{gateway:{image:'old',environment:{TOKEN:'one$$two$$$$three'},volumes:[{type:'bind',source:'/old/bundles',target:'/srv/web',read_only:true},{type:'volume',source:'data',target:'/data'}],networks:{default:{aliases:['gateway']}}}},volumes:{data:{name:'caddy-data'}},networks:{default:{name:'staging-net'}}};
test('models preserve every effective environment value including literal dollars and change only image/Web bind',()=>{
 const m=makeModels(resolved,'gateway',before,oldImage,newImage,'/new/bundles');
 assert.equal(m.candidate.services.gateway.image,'sha256:new');assert.equal(m.rollback.services.gateway.image,'sha256:old');
 assert.equal(m.candidate.services.gateway.volumes[0].source,'/new/bundles');assert.equal(m.rollback.services.gateway.volumes[0].source,'/old/bundles');
 assert.equal(m.candidate.services.gateway.environment.TOKEN,'one$$two$$$$three');
 assert.deepEqual(m.candidate.volumes,m.rollback.volumes);assert.deepEqual(m.candidate.networks,m.rollback.networks);
});
test('rejects source mismatch and new unreviewed image environment before mutation',()=>{
 const changed=structuredClone(resolved);changed.services.gateway.environment.TOKEN='changed';assert.throws(()=>makeModels(changed,'gateway',before,oldImage,newImage,'/new'));
 assert.throws(()=>makeModels(resolved,'gateway',before,oldImage,{Id:'new',Config:{Env:['UNREVIEWED=true']}},'/new'));
});
test('runtime checks reject financial environment, TLS mounts, port and protection regressions',()=>{
 const m=makeModels(resolved,'gateway',before,oldImage,newImage,'/new/bundles');const current=structuredClone(before);current.Image='sha256:new';current.Mounts[0].Source='/new/bundles';
 assert.doesNotThrow(()=>assertRuntime(before,current,'gateway',newImage,m.candidate,'/new/bundles'));
 for(const change of [c=>c.Config.Env[1]='TOKEN=changed',c=>c.Mounts[1].Name='other',c=>c.HostConfig.PortBindings={},c=>c.HostConfig.CapDrop=[],c=>c.Config.Entrypoint=['other'],c=>c.State.Health.Status='unhealthy']){const c=structuredClone(current);change(c);assert.throws(()=>assertRuntime(before,c,'gateway',newImage,m.candidate,'/new/bundles'));}
 assert.equal(environmentMap(before.Config.Env).TOKEN,'one$two$$three');
});
test('activation plan requires exact prepared directory, digest and absolute artifact path',()=>{
 assert.doesNotThrow(()=>activationArguments(['/opt/ramo-nessa-regions/releases/'+'a'.repeat(12),'b'.repeat(64),'/tmp/web.zip']));
 for(const args of [[],['/tmp/release','b'.repeat(64),'/tmp/web.zip'],['/opt/ramo-nessa-regions/releases/'+'a'.repeat(12),'wrong','web.zip']])assert.throws(()=>activationArguments(args));
});
test('identity ignores map/alias/environment ordering and still detects credential, mount and port changes',()=>{
 const a=structuredClone(before);a.Id='same';a.State.StartedAt='same';a.NetworkSettings.Networks['staging-net'].Aliases=['gateway','stable-name'];
 a.HostConfig.Mounts=[{Type:'bind',Source:'/old/bundles',Target:'/srv/web'},{Type:'bind',Source:'/old/Caddyfile',Target:'/etc/caddy/Caddyfile'}];
 const b=structuredClone(a);b.Config.Env.reverse();b.NetworkSettings.Networks['staging-net'].Aliases.reverse();b.HostConfig=Object.fromEntries(Object.entries(b.HostConfig).reverse());b.HostConfig.Mounts.reverse();b.Mounts.reverse();
 assert.equal(identity(a),identity(b));
 for(const change of [c=>c.Config.Env[0]='TOKEN=changed',c=>c.Mounts[0].Source='/other',c=>c.HostConfig.PortBindings={},c=>c.Image='other',c=>c.Id='other']){const c=structuredClone(b);change(c);assert.notEqual(identity(a),identity(c));}
});

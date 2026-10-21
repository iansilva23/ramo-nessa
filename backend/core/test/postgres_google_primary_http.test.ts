import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../src/db/postgres.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {prepareThreeRegionCatalog,applyManagementMutation} from '../src/pricing/management-service.js';
import {verifyPlaceProof} from '../src/places/place-proof.js';

const disposable='postgresql://ramo_ci:ramo_ci_ephemeral_only@127.0.0.1:5432/ramo_v5_ci';
const enabled=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_V5_EPHEMERAL_PG==='true'&&process.env.DATABASE_URL===disposable;
const secret='synthetic-google-http-proof-secret-123456789';
const session='11111111-1111-4111-8111-111111111111';
test('actual managed Core HTTP: Google first, unmodified queries, details/proofs, no GeoDB short-circuit and no coverage bypass',
  {skip:!enabled,timeout:90000},async()=>{
    const root=createPostgresPool(disposable),schema='google_http_'+randomUUID().replaceAll('-','');
    const db=new URL(disposable);db.searchParams.set('options','-c search_path='+schema+',public');
    const pool=createPostgresPool(db.toString());
    const calls:Array<{path:string;body:any}>=[];
    let failGoogle=false,server:ReturnType<typeof spawn>|undefined;
    const mock=createServer(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):null;
      calls.push({path:req.url??'',body});
      res.setHeader('content-type','application/json');
      if(failGoogle){res.statusCode=503;res.end('{}');return;}
      if(req.url?.includes('autocomplete')){
        res.end(JSON.stringify({suggestions:[
          {placePrediction:{placeId:'city-id',structuredFormat:{mainText:{text:'Fortaleza'},secondaryText:{text:'CE'}}}},
          {placePrediction:{placeId:'hotel-id',structuredFormat:{mainText:{text:'Hotel Centro'},secondaryText:{text:'Fortaleza CE'}}}},
        ]}));return;
      }
      const place={id:'hotel-id',displayName:{text:'Hotel Centro'},formattedAddress:'Rua sintética CE',location:{latitude:-3.82428,longitude:-38.55410}};
      const outside={...place,id:'outside-id',location:{latitude:-23.55,longitude:-46.63}};
      res.end(JSON.stringify(req.url?.includes('searchText')?{places:[place,outside]}:req.url?.includes('outside-id')?outside:place));
    });
    const request=async(path:string,body:unknown,token?:string)=>{
      const response=await fetch('http://127.0.0.1:18772'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
      return {status:response.status,body:await response.json() as Record<string,any>};
    };
    try{
      await root.query('CREATE SCHEMA '+schema);
      for(const table of ['pricing_catalog_versions','auth_sessions','auth_identities','geo_catalog_places']){
        await root.query('CREATE TABLE '+schema+'.'+table+' (LIKE public.'+table+' INCLUDING ALL)');
      }
      const snapshot=applyManagementMutation(prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),{kind:'region.save',region:{
        id:'region-generated-fortaleza',zoneId:'external',name:'Fortaleza',municipality:'Fortaleza',state:'CE',
        latitude:-3.82428,longitude:-38.55410,radiusKm:25,categoryIds:['comfort_black'],enabled:true,archived:false,
      }}).snapshot;
      const id=randomUUID(),actor=randomUUID();
      await pool.query("INSERT INTO pricing_catalog_versions(id,status,snapshot,effective_from,created_by_kind,created_by_id,created_by_name,published_by_kind,published_by_id,published_by_name,created_at,updated_at,published_at) VALUES ($1,'published',$2,now()-interval '1 minute','user',$3,'Synthetic tester','user',$3,'Synthetic tester',now(),now(),now())",[id,snapshot,actor]);
      await pool.query("INSERT INTO geo_catalog_places(id,source,source_id,name,normalized_name,normalized_address,address,category,city,latitude,longitude) VALUES ('geo:manual:fixture','manual','fixture','Fortaleza local fixture','fortaleza local fixture','prea','Preá CE','poi','Cruz',-2.82017,-40.41467)");
      const before=(await pool.query('SELECT snapshot FROM pricing_catalog_versions WHERE id=$1',[id])).rows[0].snapshot;
      await new Promise<void>(resolve=>mock.listen(0,'127.0.0.1',resolve));
      const address=mock.address();assert.ok(address&&typeof address!=='string');
      const logs:string[]=[];
      server=spawn(process.execPath,['--import','tsx','src/server.ts'],{cwd:fileURLToPath(new URL('../',import.meta.url)),
        env:{...process.env,DATABASE_URL:db.toString(),PORT:'18772',NODE_ENV:'test',ROUTING_PROVIDER:'google',
          GOOGLE_MAPS_SERVER_API_KEY:'synthetic-only',GOOGLE_PLACES_BASE_URL:`http://127.0.0.1:${address.port}/v1/`,
          PLACE_PROOF_SECRET:secret,MERCADO_PAGO_MODE:'disabled',PUSH_PROVIDER:'disabled',
          GEO_CATALOG_SEARCH_ENABLED:'true',GEO_PASSENGER_LEARNING_ENABLED:'false',GEO_STORAGE_AUTOMATION_ENABLED:'false'},
        stdio:['ignore','pipe','pipe']});
      const collect=(b:Buffer)=>{if(logs.join('').length<16000)logs.push(b.toString());};server.stdout?.on('data',collect);server.stderr?.on('data',collect);
      let ready=false;
      for(let i=0;i<100;i++){
        if(server.exitCode!==null)throw Error('Isolated Core exited: '+logs.join('').slice(-3000));
        try{if((await fetch('http://127.0.0.1:18772/ready')).ok){ready=true;break;}}catch{}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(ready,'isolated Core readiness');
      for(const query of ['fortal','Fortaleza','Fortaleza CE','hotel','Caiçara']){
        const result=await request('/v1/maps/places/autocomplete',{searchMode:'google',input:query,sessionToken:session,localOnly:true});
        assert.equal(result.status,200);assert.equal(result.body.provider,'google');
        assert.deepEqual(result.body.suggestions.map((r:any)=>r.placeId),['city-id','hotel-id']);
        assert.equal(calls.at(-1)!.body.input,query);assert.ok(calls.at(-1)!.body.locationBias);assert.equal(calls.at(-1)!.body.locationRestriction,undefined);
      }
      const details=await request('/v1/maps/places/details',{searchMode:'google',placeId:'hotel-id',sessionToken:session,localOnly:false,externalLocalityId:'wrong-old-id'});
      assert.equal(details.status,200);assert.equal(details.body.place.approvedPricingLocalityId,'region-generated-fortaleza');
      verifyPlaceProof({proof:details.body.place.placeProof,localityId:'region-generated-fortaleza',latitude:-3.82428,longitude:-38.55410,secret});
      const manual=await request('/v1/maps/places/search',{searchMode:'google',query:'Fortaleza',localOnly:false});
      assert.equal(manual.status,200);assert.equal(manual.body.places.length,2);
      assert.equal(manual.body.places[0].approvedPricingLocalityId,'region-generated-fortaleza');
      assert.equal(manual.body.places[1].placeProof,undefined);
      const outside=await request('/v1/maps/places/details',{searchMode:'google',placeId:'outside-id',sessionToken:session});
      assert.equal(outside.status,200);assert.equal(outside.body.place.placeProof,undefined);
      assert.equal((await request('/v1/maps/places/classify-coordinate',{latitude:-23.55,longitude:-46.63})).status,422);
      const beforeAuth=calls.length;
      assert.equal((await request('/v1/maps/places/autocomplete',{searchMode:'google',input:'fortal',sessionToken:session},'invalid')).status,401);
      assert.equal(calls.length,beforeAuth);
      const legacy=await request('/v1/maps/places/autocomplete',{input:'fortal',sessionToken:session,localOnly:true});
      assert.equal(legacy.body.provider,'ramo-geo');assert.equal(calls.length,beforeAuth);
      failGoogle=true;
      assert.equal((await request('/v1/maps/places/autocomplete',{searchMode:'google',input:'fortal',sessionToken:session})).status,503);
      assert.deepEqual((await pool.query('SELECT snapshot FROM pricing_catalog_versions WHERE id=$1',[id])).rows[0].snapshot,before);
      assert.equal((await pool.query('SELECT count(*) AS total FROM geo_catalog_places')).rows[0].total,'1');
    }finally{
      if(server&&server.exitCode===null){const stopped=once(server,'exit');server.kill('SIGTERM');await Promise.race([stopped,new Promise(resolve=>setTimeout(resolve,3000))]);if(server.exitCode===null)server.kill('SIGKILL');}
      await new Promise<void>(resolve=>mock.close(()=>resolve()));
      await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();
    }
  });

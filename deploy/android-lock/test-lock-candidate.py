#!/usr/bin/env python3
"""Run the prepared candidate only against disposable PostgreSQL over a Unix socket."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time

PLAN=Path("/opt/ramo-nessa-security/candidate-screen-lock-e2dfhu83/result.json")
EXPECTED_BASE="sha256:a9228cfd6e52144338e03d64e1dcb5f6e3e251adfabf75ed0886d073b1e6bdb6"
EXPECTED_CANDIDATE="sha256:449ead609890bc47d4274d4bc3e1df545ba87f5a732881efeb4037482a2e4083"
EXPECTED_TAG="ramo-nessa-screenlock-candidate:e2dfhu83"
TEST_SOURCE=json.loads("\"import assert from 'node:assert/strict';\\nimport test from 'node:test';\\nimport { randomUUID } from 'node:crypto';\\nimport { spawn } from 'node:child_process';\\nimport { openSync, closeSync, readFileSync } from 'node:fs';\\nimport { resolve } from 'node:path';\\nimport { pathToFileURL } from 'node:url';\\nconst coreDist=process.env.RAMO_LOCK_CORE_DIST || '/app/dist';\\nconst core=path=>import(pathToFileURL(resolve(coreDist,'src',path)).href);\\nconst {createPostgresPool}=await core('db/postgres.js');\\nconst {PostgresRideMatchingRepository}=await core('matching/postgres-ride-matching-repository.js');\\nconst {PostgresRideRepository}=await core('rides/repositories/postgres-ride-repository.js');\\nconst {PostgresDriverSupplyRepository}=await core('drivers/repositories/postgres-driver-supply-repository.js');\\nconst {advancePendingRideDispatch}=await core('rides/pending-dispatch-service.js');\\nconst {dispatchRideAfterPayment}=await core('rides/dispatch-after-payment.js');\\ntest('screen lock and acceptance serialize without abandoning an accepted paid ride', { skip: process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only' }, async () => {\\n  const url = new URL(process.env.DATABASE_URL ?? '');\\n  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/ramo_lock_test');\\n  const pool = createPostgresPool(url.toString()), rides = new PostgresRideRepository(pool);\\n  const drivers = new PostgresDriverSupplyRepository(pool), matching = new PostgresRideMatchingRepository(pool);\\n  const start = new Date('2026-10-01T12:00:00.000Z'), at = new Date(start.getTime()+5000).toISOString();\\n  try {\\n    for (let i=0; i<33; i++) {\\n      const rideId=randomUUID(), driverId='atomic-lock-'+randomUUID();\\n      await rides.create({id:rideId, passengerId:'test-'+randomUUID(), state:'PAID', paymentStatus:'paid',\\n        origin:{zoneId:'prea'}, destination:{zoneId:'jijoca'}, category:'car', period:'day', passengers:1,\\n        quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},\\n        createdAt:start.toISOString(),updatedAt:start.toISOString()});\\n      await drivers.upsert({driverId,vehicleId:randomUUID(),categories:['car'],fourByFour:false,seatCapacity:4,\\n        online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:start.toISOString(),updatedAt:start.toISOString()});\\n      const created=await matching.createOffer({rideId,driverId,approximatePickupDistanceKm:1,createdAt:start.toISOString(),\\n        expiresAt:new Date(start.getTime()+35000).toISOString()});\\n      const lock=()=>matching.lockScreenPendingOffer({offerId:created.offer.id,driverId,at});\\n      const accept=()=>matching.acceptOffer({offerId:created.offer.id,driverId,acceptedAt:at});\\n      if(i===0) {\\n        await assert.rejects(() => matching.lockScreenPendingOffer({offerId:created.offer.id,driverId:'other-driver',at}));\\n        assert.equal((await matching.findOfferById(created.offer.id))?.status,'OFFERED');\\n        assert.equal(await lock(),'REJECTED');\\n        assert.equal(await lock(),'REJECTED'); // Retry is idempotent; the paid ride itself records pending work.\\n        await assert.rejects(accept);\\n      }\\n      else if(i===1) { await accept(); assert.equal(await lock(),'ACCEPTED'); }\\n      else if(i===32) { assert.equal(await matching.lockScreenPendingOffer({offerId:created.offer.id,driverId,at:new Date(start.getTime()+36000).toISOString()}),'EXPIRED'); }\\n      else await Promise.allSettled(i%2===0?[lock(),accept()]:[accept(),lock()]);\\n      const offer=await matching.findOfferById(created.offer.id),ride=await rides.findById(rideId),supply=await drivers.findByDriverId(driverId);\\n      assert.ok(offer && ride && supply);\\n      assert.equal(ride.paymentStatus,'paid');\\n      if(offer.status==='ACCEPTED') {\\n        assert.equal(ride.driverId,driverId); assert.equal(ride.state,'DRIVER_ASSIGNED');\\n        assert.equal(supply.busy,true); assert.equal(supply.online,true);\\n      } else {\\n        assert.equal(offer.status,i===32?'EXPIRED':'REJECTED'); assert.equal(supply.online,false);\\n        assert.equal(supply.busy,false); assert.notEqual(ride.driverId,driverId);\\n      }\\n    }\\n  } finally { await pool.end(); }\\n});\\n\\ntest('recovery invokes real dispatch and retry does not duplicate the offer', {skip:process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only'}, async()=>{\\n  const url=new URL(process.env.DATABASE_URL ?? ''); assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/ramo_lock_test');\\n  const pool=createPostgresPool(url.toString()), rides=new PostgresRideRepository(pool), drivers=new PostgresDriverSupplyRepository(pool), matching=new PostgresRideMatchingRepository(pool);\\n  const start=new Date('2026-10-01T12:00:00.000Z'), at=new Date(start.getTime()+5000);\\n  const rideId=randomUUID(), first='lock-first-'+randomUUID(), second='lock-next-'+randomUUID();\\n  try{\\n    await rides.create({id:rideId,passengerId:'recovery-'+randomUUID(),state:'PAID',paymentStatus:'paid',\\n      pickupLatitude:-2.821,pickupLongitude:-40.414,origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day',passengers:1,\\n      quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},\\n      createdAt:start.toISOString(),updatedAt:start.toISOString()});\\n    for(const driverId of [first,second]) await drivers.upsert({driverId,vehicleId:randomUUID(),categories:['car'],fourByFour:false,seatCapacity:4,\\n      online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:start.toISOString(),updatedAt:start.toISOString()});\\n    const offer=await matching.createOffer({rideId,driverId:first,approximatePickupDistanceKm:1,createdAt:start.toISOString(),expiresAt:new Date(start.getTime()+35000).toISOString()});\\n    assert.equal(await matching.lockScreenPendingOffer({offerId:offer.offer.id,driverId:first,at:at.toISOString()}),'REJECTED');\\n    const request={pool,offerId:offer.offer.id,dispatch:{rides,drivers,matching,now:at,canOfferDriver:async (id)=>id===second}};\\n    // Use the existing startup/periodic recovery, with no device retry.\\n    const failures = [];\\n    await advancePendingRideDispatch({\\n      rides, now:at,\\n      dispatch:(ride,now)=>dispatchRideAfterPayment({...request.dispatch,ride,now}),\\n      onFailure:(_rideId,error)=>failures.push(error),\\n    });\\n    assert.equal(failures.length,0);\\n    let active=(await matching.listOffersForRide(rideId)).filter(o=>o.status==='OFFERED');\\n    assert.equal(active.length,1); assert.equal(active[0]?.driverId,second);\\n    // Re-running the existing sweep must retain the active offer.\\n    await advancePendingRideDispatch({\\n      rides, now:at,\\n      dispatch:(ride,now)=>dispatchRideAfterPayment({...request.dispatch,ride,now}),\\n    });\\n    active=(await matching.listOffersForRide(rideId)).filter(o=>o.status==='OFFERED');\\n    assert.equal(active.length,1); assert.equal(active[0]?.driverId,second);\\n    assert.equal((await rides.findById(rideId))?.paymentStatus,'paid');\\n  }finally{await pool.end();}\\n});\\n\\ntest('idle lock serializes with creation of a paid offer', {skip:process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only'}, async()=>{\\n  const url=new URL(process.env.DATABASE_URL ?? ''); assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/ramo_lock_test');\\n  const pool=createPostgresPool(url.toString()),rides=new PostgresRideRepository(pool),drivers=new PostgresDriverSupplyRepository(pool),matching=new PostgresRideMatchingRepository(pool);\\n  const now=new Date('2026-10-01T12:00:00.000Z'),at=now.toISOString();\\n  try {\\n    for(let i=0;i<20;i++) {\\n      const driverId='idle-lock-'+randomUUID(),rideId=randomUUID();\\n      await drivers.upsert({driverId,vehicleId:randomUUID(),categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:at,updatedAt:at});\\n      await rides.create({id:rideId,passengerId:'test-'+randomUUID(),state:'PAID',paymentStatus:'paid',origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day',passengers:1,\\n        quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},createdAt:at,updatedAt:at});\\n      const creation=matching.createOffer({rideId,driverId,approximatePickupDistanceKm:1,createdAt:at,expiresAt:new Date(now.getTime()+35000).toISOString()});\\n      const locked=matching.lockDriverScreen({driverId,at});\\n      const results=await Promise.allSettled([creation,locked]);\\n      assert.equal(results[1].status,'fulfilled');\\n      const outcome=await matching.lockDriverScreen({driverId,at});\\n      if(outcome.outcome==='OFFER_PENDING') {\\n        assert.ok(outcome.offerId);\\n        await matching.lockScreenPendingOffer({driverId,offerId:outcome.offerId,at});\\n      }\\n      assert.equal((await matching.lockDriverScreen({driverId,at})).outcome,'OFFLINE');\\n      assert.equal((await drivers.findByDriverId(driverId))?.online,false);\\n      assert.equal((await matching.listOffersForRide(rideId)).filter(o=>o.status==='OFFERED').length,0);\\n    }\\n  }finally{await pool.end();}\\n});\\n\\n\\ntest('candidate HTTP: authentication, idle lock, accepted ride and restart',\\n {skip:process.env.RAMO_LOCK_RACE_TEST!=='isolated-ci-only', timeout:90000}, async()=>{\\n  const url=new URL(process.env.DATABASE_URL ?? '');\\n  assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/ramo_lock_test');\\n  const pool=createPostgresPool(url.toString()),rides=new PostgresRideRepository(pool),drivers=new PostgresDriverSupplyRepository(pool),matching=new PostgresRideMatchingRepository(pool);\\n  const now=new Date(), at=now.toISOString(), idle='http-idle-'+randomUUID(), accepted='http-accepted-'+randomUUID(),rideId=randomUUID();\\n  let child;\\n  const base='http://127.0.0.1:18911';\\n  const log=resolve(process.env.TMPDIR || '/tmp','lock-http-'+process.pid+'.log');\\n  async function stop(){\\n    if(!child || child.exitCode!=null)return;\\n    const proc=child;\\n    await new Promise(resolve=>{\\n      const timer=setTimeout(()=>{proc.kill('SIGKILL');},5000);\\n      proc.once('exit',()=>{clearTimeout(timer);resolve();});\\n      proc.kill('SIGTERM');\\n    });\\n    child=undefined;\\n  }\\n  async function start(){\\n    const fd=openSync(log,'a',0o600);\\n    const secret='isolated-test-only-0123456789abcdef0123456789abcdef';\\n    child=spawn(process.execPath,[resolve(coreDist,'src/server.js')],{\\n      env:{...process.env,NODE_ENV:'test',PORT:'18911',ALLOW_DEV_IDENTITY:'true',\\n        ALLOW_DEV_OTP:'true',OTP_PROVIDER:'dev',OTP_HASH_SECRET:secret,OTP_RATE_LIMIT_SECRET:secret,\\n        PLACE_PROOF_SECRET:secret,ADMIN_LOGIN_RATE_LIMIT_SECRET:secret,\\n        DOCUMENT_STORAGE_LOCAL_DIR:'/tmp/ramo-lock-documents',DOCUMENT_STORAGE_BASE_URL:'',DOCUMENT_STORAGE_AUTH_TOKEN:'',\\n        ADMIN_MFA_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64'),DOCUMENT_INSPECTION_ENCRYPTION_KEY:Buffer.alloc(32,34).toString('base64'),\\n        PUSH_PROVIDER:'disabled',FIREBASE_SERVICE_ACCOUNT_FILE:'',FIREBASE_SERVICE_ACCOUNT_JSON:'',\\n        GOOGLE_MAPS_SERVER_API_KEY:'',ROUTING_PROVIDER:'google',DB_SSL:'false',DB_POOL_MAX:'2',\\n        MERCADO_PAGO_ACCESS_TOKEN:'',MERCADO_PAGO_WEBHOOK_SECRET:'',MERCADO_PAGO_MODE:'test',\\n        ASAAS_API_KEY_FILE:'',ASAAS_WEBHOOK_TOKEN_FILE:'',ASAAS_PAYOUTS_ENABLED:'false',\\n        DRIVER_PAYOUT_PROVIDER_NAME:'',DRIVER_PAYOUT_PROVIDER_URL:'',DRIVER_PAYOUT_PROVIDER_TOKEN:'',ASAAS_WEBHOOK_ENABLED:'false',GEO_STORAGE_AUTOMATION_ENABLED:'false',\\n        SHUTDOWN_TIMEOUT_MS:'2000'},\\n      stdio:['ignore',fd,fd]\\n    });\\n    closeSync(fd);\\n    for(let i=0;i<100;i++){\\n      if(child.exitCode!=null)throw new Error('Isolated HTTP server stopped: '+readFileSync(log,'utf8').slice(-4000));\\n      try{const res=await fetch(base+'/ready',{signal:AbortSignal.timeout(500)});await res.body?.cancel();if(res.ok)return;}catch{}\\n      await new Promise(r=>setTimeout(r,150));\\n    }\\n    throw new Error('Isolated HTTP server did not become ready; private log '+log);\\n  }\\n  async function locked(id){\\n    const res=await fetch(base+'/v1/driver/me/screen-lock',{method:'POST',headers:{'x-dev-driver-id':id},signal:AbortSignal.timeout(5000)});\\n    assert.equal(res.status,200);return res.json();\\n  }\\n  try {\\n    // Only this disposable test database contains these completed earlier fixtures.\\n    await pool.query(\\\"UPDATE rides SET state='CANCELLED_BY_ADMIN' WHERE state IN ('PAID','SEARCHING_DRIVER')\\\");\\n    for(const driverId of [idle,accepted]) await drivers.upsert({driverId,vehicleId:randomUUID(),categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:at,updatedAt:at});\\n    await rides.create({id:rideId,passengerId:'http-passenger-'+randomUUID(),state:'PAID',paymentStatus:'paid',origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day',passengers:1,quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},createdAt:at,updatedAt:at});\\n    const offer=await matching.createOffer({rideId,driverId:accepted,approximatePickupDistanceKm:1,createdAt:at,expiresAt:new Date(now.getTime()+120000).toISOString()});\\n    await matching.acceptOffer({offerId:offer.offer.id,driverId:accepted,acceptedAt:at});\\n    await start();\\n    const denied=await fetch(base+'/v1/driver/me/screen-lock',{method:'POST',headers:{authorization:'Bearer invalid-isolated-token'},signal:AbortSignal.timeout(5000)});\\n    assert.equal(denied.status,401);await denied.body?.cancel();\\n    assert.equal((await drivers.findByDriverId(idle))?.online,true);\\n    assert.equal((await locked(idle)).outcome,'OFFLINE');\\n    assert.equal((await locked(idle)).outcome,'OFFLINE');\\n    assert.equal((await locked(accepted)).outcome,'ACCEPTED');\\n    assert.equal((await drivers.findByDriverId(accepted))?.online,true);\\n    assert.equal((await drivers.findByDriverId(accepted))?.busy,true);\\n    await stop();await start();\\n    assert.equal((await locked(idle)).outcome,'OFFLINE');\\n    assert.equal((await locked(accepted)).outcome,'ACCEPTED');\\n    assert.equal((await rides.findById(rideId))?.state,'DRIVER_ASSIGNED');\\n    assert.equal((await rides.findById(rideId))?.paymentStatus,'paid');\\n    const tables=await pool.query(\\\"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('payments','ledger_transactions')\\\");\\n    assert.equal(tables.rowCount,2,'Financial audit tables must exist');\\n    for(const {tablename} of tables.rows){\\n      const result=await pool.query('SELECT count(*)::int AS count FROM \\\"'+tablename+'\\\"');\\n      assert.equal(result.rows[0].count,0,'No payment or ledger row may be created by these tests');\\n    }\\n    console.log('# diagnostic '+JSON.stringify({candidateHttp:true,restartRecovery:true,paidRidePreserved:true,testPaymentsCreated:0,testLedgerTransactionsCreated:0,realProviderRequests:0}));\\n  } finally {await stop();await pool.end();}\\n});\\n\\n\"")
PRODUCTION=["ramo-nessa-staging-core-1","ramo-nessa-staging-gateway-1",
            "ramo-nessa-staging-postgres-1","ramo-nessa-site-institutional-site-1"]
OWNER="br.com.ramonessa.screen-lock-test"
BASE_HASHES={
 "/app/dist/src/server.js":"f0b57a4d160396177810b95a86d28b4a2e2b1ee8fd67043bfe3a02f54a28f075",
 "/app/dist/src/matching/postgres-ride-matching-repository.js":"3674660de29eadca2062ec4f2a4a8bab0f70ad6cf0588136f6eeb6c02c928058",
}

def docker(*args):
    return subprocess.check_output(["docker",*args])

def metadata(name):
    fmt='{"name":{{json .Name}},"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"started":{{json .State.StartedAt}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
    return json.loads(docker("inspect","--format",fmt,name))

def image_matches(image, expected):
    refs=[image.get("Id"),(image.get("Descriptor") or {}).get("digest")]
    refs += [x.rsplit("@",1)[-1] for x in image.get("RepoDigests") or []]
    return expected in refs

def main():
    if os.geteuid()!=0: raise SystemExit("Execute com sudo python3.")
    os.umask(0o077)
    if PLAN.is_symlink(): raise SystemExit("Registro inesperado.")
    plan=json.loads(PLAN.read_text())
    if (plan.get("candidateImage"),plan.get("candidateImageId"),plan.get("originalImage")) != (EXPECTED_TAG,EXPECTED_CANDIDATE,EXPECTED_BASE):
        raise SystemExit("Candidata divergente; nenhum teste iniciado.")
    before=[metadata(name) for name in PRODUCTION]
    if any(not c["running"] or c["health"] not in (None,"healthy") for c in before):
        raise SystemExit("Serviço ativo sem saúde; teste não iniciado.")
    if before[0]["image"]!=EXPECTED_BASE:
        raise SystemExit("A API ativa mudou; revisar antes do teste.")
    for path,expected in BASE_HASHES.items():
        if hashlib.sha256(docker("exec",PRODUCTION[0],"cat",path)).hexdigest()!=expected:
            raise SystemExit("Código ativo divergente; teste não iniciado.")
    image=json.loads(docker("image","inspect",EXPECTED_TAG))[0]
    if not image_matches(image,EXPECTED_CANDIDATE):
        probe=subprocess.run(["docker","image","inspect",EXPECTED_CANDIDATE],capture_output=True,text=True)
        if probe.returncode or json.loads(probe.stdout)[0]["Id"]!=image["Id"]:
            raise SystemExit("Não foi possível confirmar o identificador da candidata.")
    candidate_id=image["Id"]
    blocked=("ASAAS_","MERCADO_PAGO_","ENTRAR_","GOOGLE_MAPS_SERVER_","FIREBASE_SERVICE_ACCOUNT")
    if any(e.split("=",1)[0].startswith(blocked) for e in image["Config"].get("Env",[])):
        raise SystemExit("Imagem contém configuração de provedor; revisão necessária.")
    for filename,app_path in [("server.js","/app/dist/src/server.js"),("matching.js","/app/dist/src/matching/postgres-ride-matching-repository.js")]:
        local=PLAN.parent/"candidate"/filename
        if local.is_symlink() or not local.is_file(): raise SystemExit("Fonte candidata inválida.")
        raw=docker("run","--rm","--pull=never","--network=none","--entrypoint","cat",candidate_id,app_path)
        if hashlib.sha256(raw).digest()!=hashlib.sha256(local.read_bytes()).digest():
            raise SystemExit("Fonte candidata diverge da imagem.")
    base=Path("/var/lib/ramo-nessa-security-tests")
    base.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(base).free<1024**3: raise SystemExit("Menos de 1 GB livre.")
    available=next((int(line.split()[1])*1024 for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemAvailable:")),0)
    if available<768*1024**2: raise SystemExit("Menos de 768 MB disponíveis; teste não iniciado.")
    nonce=secrets.token_hex(8)
    stem="ramo-lock-test-"+nonce
    directory=base/stem
    directory.mkdir(mode=0o700)
    test_dir=directory/"payload"
    test_dir.mkdir(mode=0o755)
    test_file=test_dir/"lock-candidate.test.mjs"
    test_file.write_text(TEST_SOURCE)
    test_file.chmod(0o644)
    db_name,runner=stem+"-postgres",stem+"-runner"
    volumes=[stem+"-data",stem+"-socket"]
    created=[]
    passed=False
    cleanup=[]
    label=OWNER+"="+nonce

    def run(args,stage,timeout=180):
        path=directory/(stage+".private.log")
        with path.open("w") as log:
            process=subprocess.Popen(["docker",*args],stdout=log,stderr=subprocess.STDOUT)
            start=time.monotonic()
            offset=0
            next_progress=start+20
            try:
                while process.poll() is None:
                    now=time.monotonic()
                    if now-start>timeout: raise RuntimeError("Tempo excedido em "+stage+"; log privado: "+str(path))
                    if stage=="tests":
                        content=path.read_text(errors="replace")
                        complete=content.rfind("\n")+1
                        for line in content[offset:complete].splitlines():
                            if line.startswith(("ok ","not ok ","# Subtest:")) or "diagnostic " in line:
                                print(line[:1600],flush=True)
                        offset=complete
                    if now>=next_progress:
                        print(stage+": "+str(int(now-start))+" segundos",flush=True)
                        next_progress=now+20
                    time.sleep(0.5)
                if process.returncode:
                    if stage=="tests": print("\n".join(path.read_text(errors="replace").splitlines()[-70:]),flush=True)
                    raise RuntimeError("Falha em "+stage+"; log privado: "+str(path))
            finally:
                if process.poll() is None: process.kill()
                process.wait()
        return path.read_text(errors="replace")

    def owned(name):
        p=subprocess.run(["docker","inspect","--format","{{json .Config.Labels}}",name],capture_output=True,text=True)
        return p.returncode==0 and (json.loads(p.stdout) or {}).get(OWNER)==nonce

    try:
        for volume in volumes:
            docker("volume","create","--label",label,volume)
            created.append(volume)
        password=secrets.token_urlsafe(30)
        print("Criando PostgreSQL descartável, sem rede e sem dados reais...",flush=True)
        run(["run","-d","--pull=never","--network=none","--name",db_name,"--label",label,
             "--memory=256m","--cpus=0.5","--pids-limit=128",
             "-e","POSTGRES_USER=ramo_security","-e","POSTGRES_DB=ramo_lock_test","-e","POSTGRES_PASSWORD="+password,
             "--mount","type=volume,src="+volumes[0]+",dst=/var/lib/postgresql/data",
             "--mount","type=volume,src="+volumes[1]+",dst=/var/run/postgresql",
             before[2]["image"],"postgres","-c","listen_addresses=","-c","unix_socket_directories=/var/run/postgresql"],"start-postgres")
        for _ in range(90):
            ready=subprocess.run(["docker","exec",db_name,"pg_isready","-U","ramo_security","-d","ramo_lock_test"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if ready.returncode==0: break
            time.sleep(1)
        else: raise RuntimeError("Banco descartável não ficou pronto.")
        url="postgresql://ramo_security:"+password+"@127.0.0.1/ramo_lock_test?host=/run/security-pg"
        command=["run","--rm","--pull=never","--network=none","--name",runner,"--label",label,
                 "--memory=512m","--cpus=0.75","--pids-limit=128","--read-only",
                 "--tmpfs","/tmp:rw,nosuid,size=64m",
                 "--mount","type=volume,src="+volumes[1]+",dst=/run/security-pg,readonly",
                 "--mount","type=bind,src="+str(test_dir)+",dst=/candidate-test,readonly",
                 "-e","NODE_ENV=test","-e","DB_SSL=false","-e","DATABASE_URL="+url,
                 "-e","RAMO_LOCK_RACE_TEST=isolated-ci-only","-e","RAMO_LOCK_CORE_DIST=/app/dist",
                 "--entrypoint","node",candidate_id]
        print("Aplicando migrations somente no banco descartável...",flush=True)
        run(command+["/app/dist/scripts/migrate.js"],"migrations")
        print("Testando a candidata: bloqueio, concorrência, HTTP, retomada e reinício...",flush=True)
        report=run(command+["--test","--test-concurrency=1","--test-reporter=tap","/candidate-test/lock-candidate.test.mjs"],"tests")
        if not all(x in report for x in ["# tests 4","# pass 4","# fail 0","# skipped 0"]):
            raise RuntimeError("Relatório incompleto; verificar log privado.")
        after=[metadata(name) for name in PRODUCTION]
        if before!=after: raise RuntimeError("O estado de um serviço ativo mudou; revisar antes de prosseguir.")
        passed=True
    finally:
        for name in (runner,db_name):
            if owned(name):
                p=subprocess.run(["docker","rm","-f",name],capture_output=True)
                if p.returncode: cleanup.append(name)
        for volume in reversed(created):
            info=json.loads(docker("volume","inspect",volume))[0]
            if (info.get("Labels") or {}).get(OWNER)!=nonce:
                cleanup.append(volume);continue
            if subprocess.run(["docker","volume","rm",volume],capture_output=True).returncode: cleanup.append(volume)
        result={"status":"ISOLATED_SCREEN_LOCK_CANDIDATE_APPROVED" if passed and not cleanup else "ISOLATED_SCREEN_LOCK_TEST_NOT_APPROVED",
                "directory":str(directory),"candidateImageId":candidate_id,
                "testResourcesRemoved":not cleanup,"cleanupPending":cleanup,
                "productionDeploymentPerformed":False,"productionContainersRestarted":False,
                "productionDatabaseUsed":False,"mobileDeviceValidationPerformed":False}
        (directory/"result.private.json").write_text(json.dumps(result,indent=2)+"\n")
        print(json.dumps(result,indent=2),flush=True)

    if cleanup: raise RuntimeError("Recursos descartáveis pendentes de remoção; revisar relatório.")

if __name__=="__main__":
    try: main()
    except Exception as error:
        print("TESTE NÃO APROVADO: "+str(error),flush=True)
        raise SystemExit(1)


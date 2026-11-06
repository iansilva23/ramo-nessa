#!/usr/bin/env python3
"""Prepare a candidate image from the verified active image; never deploy it."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

EXPECTED_IMAGE = "sha256:a9228cfd6e52144338e03d64e1dcb5f6e3e251adfabf75ed0886d073b1e6bdb6"
EXPECTED = {
    "server.js": ("src/server.js", "f0b57a4d160396177810b95a86d28b4a2e2b1ee8fd67043bfe3a02f54a28f075"),
    "matching.js": ("src/matching/postgres-ride-matching-repository.js", "3674660de29eadca2062ec4f2a4a8bab0f70ad6cf0588136f6eeb6c02c928058"),
    "recovery.js": ("src/rides/pending-dispatch-service.js", "4e8257fe9314e2b2bab1f3d77b04742b68670117010b45b32ea02d8a7c0b565a"),
}
PATCH = json.loads("{\"methods\":\"  async lockDriverScreen(input) {\\n    const client=await this.pool.connect();\\n    try {\\n      await client.query('BEGIN');\\n      // Lock supply first, but do not lock offers or rides from this transaction.\\n      // Acceptance may hold an offer lock while waiting for this supply row.\\n      const supply=await client.query(\\n        'SELECT busy FROM driver_supply WHERE driver_id=$1 FOR UPDATE',[input.driverId]);\\n      if (supply.rows[0]?.busy) {\\n        await client.query('COMMIT'); return {outcome:'ACCEPTED'};\\n      }\\n      const active=await client.query(\\n        `SELECT 1 FROM rides WHERE driver_id=$1 AND state IN\\n          ('AWAITING_PAYMENT','PAID','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS') LIMIT 1`,\\n        [input.driverId]);\\n      if ((active.rowCount ?? 0)>0) {\\n        await client.query('COMMIT'); return {outcome:'ACCEPTED'};\\n      }\\n      const offered=await client.query(\\n        \\\"SELECT id FROM ride_offers WHERE driver_id=$1 AND status='OFFERED' ORDER BY created_at,id LIMIT 1\\\",\\n        [input.driverId]);\\n      if (offered.rows[0]!=null) {\\n        await client.query('COMMIT'); return {outcome:'OFFER_PENDING',offerId:offered.rows[0].id};\\n      }\\n      await client.query('UPDATE driver_supply SET online=FALSE, updated_at=$2 WHERE driver_id=$1',\\n        [input.driverId,input.at]);\\n      await client.query('COMMIT'); return {outcome:'OFFLINE'};\\n    } catch(error) {\\n      await client.query('ROLLBACK'); throw error;\\n    } finally {client.release();}\\n  }\\n\\n  async lockScreenPendingOffer(input) {\\n    const client = await this.pool.connect();\\n    try {\\n      await client.query('BEGIN');\\n      const rows = await client.query(\\n        `SELECT ${OFFER_COLUMNS} FROM ride_offers WHERE id = $1 FOR UPDATE`,\\n        [input.offerId],\\n      );\\n      const offer = rows.rows[0];\\n      if (offer == null || offer.driver_id !== input.driverId) {\\n        throw new RideOfferError('OFFER_NOT_FOUND', 'Oferta não encontrada.');\\n      }\\n      // Same lock order as acceptOffer: offer, ride, supply.\\n      const ride = await lockRide(client, offer.ride_id);\\n      const supplies = await client.query(\\n        'SELECT busy FROM driver_supply WHERE driver_id = $1 FOR UPDATE', [input.driverId],\\n      );\\n      const supply = supplies.rows[0];\\n      if (offer.status === 'ACCEPTED' && ride?.driver_id === input.driverId) {\\n        await client.query('COMMIT');\\n        return 'ACCEPTED';\\n      }\\n      if ((offer.status === 'REJECTED' || offer.status === 'EXPIRED') && ride != null) {\\n        await client.query('COMMIT');\\n        return offer.status;\\n      }\\n      if (offer.status !== 'OFFERED' || ride == null || supply == null || supply.busy) {\\n        await client.query('COMMIT');\\n        return 'INACTIVE';\\n      }\\n      const status = offer.expires_at.getTime() <= Date.parse(input.at) ? 'EXPIRED' : 'REJECTED';\\n      await client.query(\\n        'UPDATE ride_offers SET status = $2, updated_at = $3 WHERE id = $1',\\n        [offer.id, status, input.at],\\n      );\\n      await client.query(\\n        `UPDATE driver_supply SET online = FALSE,\\n          reserved_ride_id = CASE WHEN reserved_ride_id = $2 THEN NULL ELSE reserved_ride_id END,\\n          reserved_until = CASE WHEN reserved_ride_id = $2 THEN NULL ELSE reserved_until END,\\n          updated_at = $3 WHERE driver_id = $1`,\\n        [offer.driver_id, offer.ride_id, input.at],\\n      );\\n      await client.query(\\n        `UPDATE rides SET reserved_driver_id = NULL, driver_hold_expires_at = NULL, updated_at = $3\\n         WHERE id = $1 AND reserved_driver_id = $2`,\\n        [offer.ride_id, offer.driver_id, input.at],\\n      );\\n      await client.query('COMMIT');\\n      return status;\\n    } catch (error) {\\n      await client.query('ROLLBACK');\\n      throw error;\\n    } finally {\\n      client.release();\\n    }\\n  }\\n\\n\",\"general\":\"    if (request.method === 'POST' && requestUrl.pathname === '/v1/driver/me/screen-lock') {\\n      const driverId=await resolveDriverId({request,sessions:authSessionRepository,identities:authOtpRepository});\\n      if (rideMatchingRepository.lockDriverScreen == null || rideMatchingRepository.lockScreenPendingOffer == null) {\\n        json(response,503,{error:'SCREEN_LOCK_UNAVAILABLE'}); return;\\n      }\\n      for(let attempt=0;attempt<20;attempt++) {\\n        const state=await rideMatchingRepository.lockDriverScreen({driverId,at:new Date().toISOString()});\\n        if(state.outcome !== 'OFFER_PENDING') {\\n          json(response,200,{outcome:state.outcome}); return;\\n        }\\n        if(state.offerId == null) break;\\n        const outcome=await rideMatchingRepository.lockScreenPendingOffer({driverId,offerId:state.offerId,at:new Date().toISOString()});\\n        if(outcome === 'ACCEPTED') {json(response,200,{outcome:'ACCEPTED'});return;}\\n        if(outcome === 'REJECTED' || outcome === 'EXPIRED') {\\n          realtimeHub.publishDriver(driverId,{type:'driver.offer.updated',offer:null,serverTime:new Date().toISOString()});\\n          void runPendingDispatch();\\n        }\\n      }\\n      json(response,503,{error:'SCREEN_LOCK_RETRY'}); return;\\n    }\\n\\n\",\"offer\":\"      if (action === 'screen-lock') {\\n        if (rideMatchingRepository.lockScreenPendingOffer == null) {\\n          json(response, 503, { error: 'SCREEN_LOCK_UNAVAILABLE' });\\n          return;\\n        }\\n        const outcome = await rideMatchingRepository.lockScreenPendingOffer({\\n          offerId, driverId, at: new Date().toISOString(),\\n        });\\n        if (outcome === 'REJECTED' || outcome === 'EXPIRED') {\\n          realtimeHub.publishDriver(driverId, {\\n            type: 'driver.offer.updated', offer: null, serverTime: new Date().toISOString(),\\n          });\\n          // The existing sweep also runs at startup and every 10 seconds.\\n          // Do not rely on the device retry to advance the paid ride.\\n          void runPendingDispatch();\\n        }\\n        json(response, 200, { outcome });\\n        return;\\n      }\\n\\n\"}")

def once(text, anchor, addition):
    if text.count(anchor) != 1:
        raise RuntimeError("Ponto de inserção divergente; nada será instalado.")
    return text.replace(anchor, addition + anchor, 1)

def patch_sources(server, matching):
    # Keep all original statements. Only add the new routes and methods,
    # plus the explicit action in the existing offer-route pattern.
    m_anchor = "    async rejectOffer(input) {"
    changed_matching = once(matching, m_anchor, PATCH["methods"])
    s_anchor = "        const driverOfferAction = requestUrl.pathname.match("
    changed_server = once(server, s_anchor, PATCH["general"])
    start = changed_server.index(s_anchor)
    stop = changed_server.index("\n", start)
    old_line = changed_server[start:stop]
    if old_line.count("(accept|reject)") != 1:
        raise RuntimeError("Rota ativa divergente.")
    new_line = old_line.replace("(accept|reject)", "(accept|reject|screen-lock)")
    changed_server = changed_server[:start] + new_line + changed_server[stop:]
    accept = "            if (action === 'accept') {"
    index = changed_server.find(accept, start)
    if index < 0 or index - start > 2000:
        raise RuntimeError("Aceite ativo divergente.")
    changed_server = changed_server[:index] + PATCH["offer"] + changed_server[index:]
    # Exact reversible comparison: preserve everything outside the additions.
    restored = changed_server.replace(PATCH["offer"], "", 1).replace(PATCH["general"], "", 1)
    restored = restored.replace(new_line, old_line, 1)
    if restored != server or changed_matching.replace(PATCH["methods"], "", 1) != matching:
        raise RuntimeError("Verificação de preservação não aprovada.")
    return changed_server, changed_matching

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def output(args):
    return subprocess.check_output(args)

def main():
    if os.geteuid() != 0:
        raise SystemExit("Execute com sudo python3.")
    os.umask(0o077)
    container = "ramo-nessa-staging-core-1"
    fmt = '{"Image":{{json .Image}},"Id":{{json .Id}},"Running":{{json .State.Running}}}'
    info = json.loads(output(["docker", "inspect", "--format", fmt, container]))
    if info["Image"] != EXPECTED_IMAGE or not info["Running"]:
        raise SystemExit("Imagem ativa divergente ou parada. Nada preparado.")
    originals = {}
    for name, (path, expected) in EXPECTED.items():
        raw = output(["docker", "exec", container, "cat", "/app/dist/" + path])
        if hashlib.sha256(raw).hexdigest() != expected:
            raise SystemExit("Código ativo divergente: " + name)
        originals[name] = raw.decode("utf-8")
    server, matching = patch_sources(originals["server.js"], originals["matching.js"])
    base = Path("/opt/ramo-nessa-security")
    base.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(base).free < 1024**3:
        raise SystemExit("Menos de 1 GB livre. Preparação não iniciada.")
    directory = Path(tempfile.mkdtemp(prefix="candidate-screen-lock-", dir=base))
    candidate = directory / "candidate"
    candidate.mkdir(mode=0o755)
    for name, content in [("server.js", server), ("matching.js", matching)]:
        path = candidate / name
        path.write_text(content, encoding="utf-8")
        path.chmod(0o644)
    for filename in ("server.js", "matching.js"):
        run(["docker", "run", "--rm", "--network", "none", "--read-only",
             "--user", "0:0", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
             "--mount", "type=bind,src=" + str(candidate) + ",dst=/candidate,readonly",
             "--entrypoint", "node", EXPECTED_IMAGE, "--check", "/candidate/" + filename])
    short = EXPECTED_IMAGE.split(":")[1][:12]
    base_tag = "ramo-nessa-screenlock-base:" + short
    anchor_tag = "ramo-nessa-ancora-bloqueio:" + short
    # Refuse to overwrite an unrelated existing local tag.
    for tag in (base_tag, anchor_tag):
        existing = subprocess.run(["docker", "image", "inspect", "--format", "{{.Id}}", tag],
                                  capture_output=True, text=True)
        if existing.returncode == 0 and existing.stdout.strip() != EXPECTED_IMAGE:
            raise SystemExit("Tag local divergente: " + tag)
        run(["docker", "image", "tag", EXPECTED_IMAGE, tag])
    (candidate / "Dockerfile").write_text(
        "FROM " + base_tag + "\n"
        "COPY server.js /app/dist/src/server.js\n"
        "COPY matching.js /app/dist/src/matching/postgres-ride-matching-repository.js\n",
        encoding="utf-8")
    tag = "ramo-nessa-screenlock-candidate:" + directory.name.removeprefix("candidate-screen-lock-")
    print("Preparando imagem candidata, sem reinstalar dependências...", flush=True)
    run(["docker", "build", "--pull=false", "--network=none", "-t", tag,
         "--iidfile", str(directory / "image-id"), str(candidate)])
    current = json.loads(output(["docker", "inspect", "--format", fmt, container]))
    if current["Id"] != info["Id"] or current["Image"] != EXPECTED_IMAGE:
        raise SystemExit("O container ativo mudou durante o preparo; não utilizar este candidato.")
    result = {
        "status": "CANDIDATE_PREPARED_SYNTAX_CHECKED_ONLY",
        "directory": str(directory),
        "candidateImage": tag,
        "candidateImageId": (directory / "image-id").read_text().strip(),
        "originalImage": EXPECTED_IMAGE,
        "originalImageAnchor": anchor_tag,
        "productionDeploymentPerformed": False,
        "productionContainersRestarted": False,
        "isolatedCandidateIntegrationTestPerformed": False,
        "mobileDeviceValidationPerformed": False,
    }
    (directory / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()


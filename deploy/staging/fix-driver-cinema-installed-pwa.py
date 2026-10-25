#!/usr/bin/env python3
"""Reversible manifest-only fix for the already-installed GPS Cinema Web preview.

Never rewrites the Flutter build, /motorista/, Passenger, Caddy, API, or Docker.
Run: sudo python3 fix-driver-cinema-installed-pwa.py install|rollback|status
"""
import fcntl
import hashlib
import json
import os
import stat
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

APP = "https://app.ramonessa.com.br"
BASE = "/motorista/gps-cinema/"
GATEWAY = "ramo-nessa-staging-gateway-1"
EXPECTED_ORIGINAL_MANIFEST = "177ba6f5af600b02ff7a03dd271747bedc45baec4be698e2bbd4eb4c619c7bb4"
EXPECTED_INDEX = "8c449b5ce22dad4e608502135b4198947a0baf356ece4883598173587398458e"
EXPECTED_MAIN = "bc0a226e5114fce864466c8636839cecf5ce9f0cfa156923df5bcb9cf318f3e2"
STATE_DIR = Path("/var/backups/ramo-nessa-web-gps-cinema-pwa")
BACKUP = STATE_DIR / "manifest.original.json"
RECORD = STATE_DIR / "state.json"

def sha(data):
    return hashlib.sha256(data).hexdigest()

def fail(message):
    raise RuntimeError(message)

def read_regular(path):
    if path.is_symlink() or not path.is_file():
        fail("Arquivo ausente ou symlink inesperado: " + str(path))
    return path.read_bytes()

def api(url):
    request = urllib.request.Request(
        APP + url, headers={"Cache-Control": "no-store", "User-Agent": "RamoNessa-PWA-Safety/1"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            fail("HTTP inesperado para " + url)
        return response.read(12 * 1024 * 1024)

def inspect():
    process = subprocess.run(
        ["docker", "inspect", GATEWAY], capture_output=True, text=True,
        check=True, timeout=30,
    )
    values = json.loads(process.stdout)
    if len(values) != 1 or not values[0].get("State", {}).get("Running"):
        fail("Gateway não está executando")
    gateway = values[0]
    if gateway["State"].get("Health", {}).get("Status") != "healthy":
        fail("Gateway não está saudável")
    web = [m for m in gateway.get("Mounts", []) if m.get("Destination") == "/srv/web"]
    caddy = [m for m in gateway.get("Mounts", []) if m.get("Destination") == "/etc/caddy/Caddyfile"]
    if len(web) != 1 or len(caddy) != 1:
        fail("Mounts Web/Caddy inesperados")
    if any(m.get("Type") != "bind" or m.get("RW") is not False for m in web + caddy):
        fail("Arquivos do gateway não são binds somente leitura")
    root = Path(web[0]["Source"])
    if root.is_symlink() or not root.is_dir():
        fail("Pasta Web do gateway inválida")
    driver, passenger = root / "driver", root / "passenger"
    candidate = driver / "gps-cinema"
    if any(p.is_symlink() or not p.is_dir() for p in (driver, passenger, candidate)):
        fail("Pastas de aplicação inesperadas; alteração recusada")
    config = read_regular(Path(caddy[0]["Source"])).decode("utf-8")
    if "handle_path /motorista/*" not in config or "root * /srv/web/driver" not in config:
        fail("Rota do motorista não corresponde à configuração auditada")
    return {
        "manifest": candidate / "manifest.json",
        "index": candidate / "index.html",
        "main": candidate / "main.dart.js",
        "driver": driver / "index.html",
        "passenger": passenger / "index.html",
    }

def build_manifest(original):
    manifest = json.loads(original)
    if not isinstance(manifest, dict) or manifest.get("name") != "Ramo Nessa Motorista":
        fail("Manifesto original não reconhecido")
    if manifest.get("start_url") != "." or manifest.get("scope") != ".":
        fail("A instalação já recebeu outro manifesto; sem sobrescrita")
    if manifest.get("display") != "standalone":
        fail("Modo instalado difere do esperado")
    manifest["name"] = "Ramo Nessa Motorista - GPS Cinema (Teste)"
    manifest["short_name"] = "RN GPS Cinema"
    manifest["id"] = BASE
    manifest["start_url"] = BASE + "index.html"
    manifest["scope"] = BASE
    return (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def atomic_write(path, payload, mode=0o644):
    descriptor, filename = tempfile.mkstemp(prefix=".ramo-pwa-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as out:
            os.fchmod(out.fileno(), mode)
            out.write(payload)
            out.flush()
            os.fsync(out.fileno())
        os.replace(filename, path)
    finally:
        if os.path.exists(filename):
            os.unlink(filename)

def snapshot(paths):
    return {k: sha(read_regular(paths[k])) for k in ("index", "main", "driver", "passenger")}

def check_published(expected_manifest):
    if sha(api(BASE + "manifest.json?ramo=pwa")) != sha(expected_manifest):
        fail("Manifesto HTTPS público não é o mesmo preparado")
    if sha(api(BASE + "index.html?ramo=pwa")) != EXPECTED_INDEX:
        fail("Atalho Web não abre o HTML correto")
    if api("/ready").strip() not in (b"", b"OK", b"ok", b"ready", b"READY"):
        # Health body is implementation-defined; HTTP 200 above is what matters.
        pass

def main(mode):
    if mode not in ("install", "rollback", "status"):
        fail("Uso: sudo python3 fix-driver-cinema-installed-pwa.py install|rollback|status")
    if os.geteuid() != 0:
        fail("Execute com sudo")
    with open("/run/lock/ramo-nessa-cinema-pwa.lock", "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        paths = inspect()
        current = read_regular(paths["manifest"])
        before = snapshot(paths)
        if before["index"] != EXPECTED_INDEX or before["main"] != EXPECTED_MAIN:
            fail("O bundle GPS Cinema instalado mudou; nenhuma atualização permitida")
        if mode == "status":
            print("Manifest atual SHA-256:", sha(current))
            print("PWA reparado:", RECORD.exists() and sha(current) != EXPECTED_ORIGINAL_MANIFEST)
            print("URL instalada:", APP + BASE + "index.html")
            return
        if mode == "install":
            if RECORD.exists() or BACKUP.exists():
                fail("Já existe registro de instalação anterior; não sobrescrever backup")
            if sha(current) != EXPECTED_ORIGINAL_MANIFEST:
                fail("Manifesto original não corresponde ao pacote testado")
            if sha(api(BASE + "manifest.json?before=1")) != sha(current):
                fail("Versão servida do manifesto difere da pasta Web")
            if sha(api(BASE + "index.html?before=1")) != EXPECTED_INDEX:
                fail("Index Web público anterior divergente")
            candidate = build_manifest(current)
            STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.chmod(STATE_DIR, 0o700)
            atomic_write(BACKUP, current, 0o600)
            info = {
                "original": sha(current), "updated": sha(candidate),
                "app": BASE, "protected": before,
            }
            atomic_write(RECORD, (json.dumps(info, indent=2) + "\n").encode(), 0o600)
            atomic_write(paths["manifest"], candidate)
            try:
                check_published(candidate)
                if snapshot(paths) != before:
                    fail("Arquivos Web fora do escopo foram alterados")
            except Exception:
                if sha(read_regular(paths["manifest"])) == sha(candidate):
                    atomic_write(paths["manifest"], current)
                raise
            print("PWA GPS CINEMA AJUSTADO, SEM REINICIAR SERVIDORES.")
            print("Novo ícone de teste deve abrir:", APP + BASE + "index.html")
            print("Manifesto original guardado; rollback disponível.")
            return
        # Explicit rollback restores exactly the original manifest, if current
        # install is the reviewed one. Never overwrite a newer deployment.
        if not RECORD.exists() or not BACKUP.exists():
            fail("Backup aprovado indisponível; não tentar retorno manual")
        info = json.loads(read_regular(RECORD))
        original = read_regular(BACKUP)
        if (info.get("app") != BASE or
            info.get("original") != EXPECTED_ORIGINAL_MANIFEST or
            info.get("original") != sha(original) or
            info.get("updated") != sha(current)):
            fail("Manifesto atual/backup diferem do registro; rollback recusado")
        if snapshot(paths) != info.get("protected"):
            fail("Outros arquivos foram alterados; rollback precisa de auditoria")
        atomic_write(paths["manifest"], original)
        check_published(original)
        if snapshot(paths) != before:
            fail("Arquivo fora do escopo mudou durante retorno")
        print("MANIFESTO ORIGINAL RESTAURADO. Os outros arquivos não foram alterados.")
        print("Atalhos já instalados podem exigir remoção manual e reinstalação.")

if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            fail("Informe install, rollback ou status")
        main(sys.argv[1])
    except Exception as error:
        print("OPERACAO RECUSADA:", error, file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Install ONLY a GPS 2D driver Web preview under the mounted driver/gps2d/.

Never recreates containers, changes proxy configuration, touches /motorista/
files, triggers ride operations or installs Android/iOS code.

Usage: sudo python3 install-driver-gps2d-sidecar.py /path/artifact.zip SHA256
"""
import fcntl
import hashlib
import io
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

EXPECTED_MAP_ID = "de20bf289d6db3ad15fdb14b"
URL = "https://app.ramonessa.com.br/motorista/gps2d/index.html"
GATEWAY = "ramo-nessa-staging-gateway-1"
MAX_OUTER = 140 * 1024 * 1024
MAX_INNER = 140 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024
EXACT_OUTER = {
    "LEIA-ME.txt", "SHA256SUMS", "ramo-motorista-gps2d-vps-web.zip"
}

def reject(reason):
    raise RuntimeError(reason)

def hash_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def docker_inspect(name):
    result = subprocess.run(
        ["docker", "inspect", name], capture_output=True,
        text=True, check=True, timeout=30
    )
    value = json.loads(result.stdout)
    if len(value) != 1:
        reject("Container não foi identificado de maneira única")
    return value[0]

def safe_zip(blob, max_size, allow_dirs):
    if len(blob) > max_size:
        reject("Pacote ZIP excede o limite")
    archive = zipfile.ZipFile(io.BytesIO(blob))
    files = {}
    total = 0
    for item in archive.infolist():
        name = item.filename
        p = PurePosixPath(name)
        if (not name or name.startswith("/") or "\\" in name or
            chr(0) in name or ":" in name or any(x in ("..", ".") for x in p.parts)):
            reject("Caminho inseguro no pacote ZIP")
        mode = stat.S_IFMT(item.external_attr >> 16)
        if mode not in (0, stat.S_IFDIR, stat.S_IFREG):
            reject("Arquivo especial ou symlink no pacote")
        if item.is_dir():
            if not allow_dirs or mode not in (0, stat.S_IFDIR):
                reject("Diretório inesperado no pacote")
            continue
        if item.flag_bits & 1 or item.compress_type not in (0, 8):
            reject("Formato ou criptografia ZIP não aprovado")
        if name in files:
            reject("Arquivo duplicado no ZIP")
        if item.file_size > MAX_OUTER:
            reject("Arquivo individual excessivo")
        total += item.file_size
        if total > MAX_EXPANDED:
            reject("ZIP expandido excessivo")
        files[name] = archive.read(item)
    return files

def public_check(expected_digest):
    request = urllib.request.Request(URL, headers={
        "Cache-Control": "no-store",
        "User-Agent": "RamoNessa-GPS2D-VPS-Verify/1"
    })
    with urllib.request.urlopen(request, timeout=35) as response:
        if response.status != 200:
            reject("URL de teste não retornou HTTP 200")
        content = response.read(10 * 1024 * 1024)
    if hashlib.sha256(content).hexdigest() != expected_digest:
        reject("O arquivo index.html do GPS2D não corresponde ao publicado; instalação revertida")
    with urllib.request.urlopen(
        urllib.request.Request(
            "https://app.ramonessa.com.br/ready",
            headers={"Cache-Control": "no-store"}
        ), timeout=20
    ) as response:
        if response.status != 200:
            reject("Health público não está HTTP 200")

def main(args):
    if os.geteuid() != 0:
        reject("Execute com sudo (somente gravação da pasta de teste)")
    if len(args) != 2 or not re.fullmatch(r"[a-f0-9]{64}", args[1]):
        reject("Uso: sudo python3 script.py ZIP_ABSOLUTO SHA256_DO_ZIP")
    archive_path = Path(args[0])
    if not archive_path.is_absolute() or archive_path.is_symlink():
        reject("Informe arquivo ZIP absoluto regular, sem symlink")
    if not archive_path.is_file() or archive_path.stat().st_size > MAX_OUTER:
        reject("ZIP ausente ou muito grande")
    if hash_file(archive_path) != args[1]:
        reject("SHA-256 do ZIP de entrada não coincide; nada será instalado")

    os.makedirs("/run/lock", exist_ok=True)
    with open("/run/lock/ramo-nessa-gps2d-test.lock", "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        gateway = docker_inspect(GATEWAY)
        if not gateway.get("State", {}).get("Running"):
            reject("Gateway não está em execução")
        if gateway["State"].get("Health", {}).get("Status") != "healthy":
            reject("Gateway não está saudável; instalação recusada")
        mounts = gateway.get("Mounts", [])
        web = [m for m in mounts if m.get("Destination") == "/srv/web"]
        caddy = [m for m in mounts if m.get("Destination") == "/etc/caddy/Caddyfile"]
        if (len(web) != 1 or len(caddy) != 1 or
            web[0].get("Type") != "bind" or web[0].get("RW") is not False or
            caddy[0].get("Type") != "bind" or caddy[0].get("RW") is not False):
            reject("Mounts estáticos atuais diferentes do esperado")
        caddyfile = Path(caddy[0]["Source"])
        if caddyfile.is_symlink() or not caddyfile.is_file():
            reject("Caddyfile ativo não é regular")
        config = caddyfile.read_text(encoding="utf-8")
        if "handle_path /motorista/*" not in config or "root * /srv/web/driver" not in config:
            reject("Caddyfile ativo não serve a rota motorista esperada")
        if "geolocation=(self)" not in config:
            reject("Política de GPS da Web não confirmada")
        webroot = Path(web[0]["Source"])
        driver_dir = webroot / "driver"
        passenger_dir = webroot / "passenger"
        if any(p.is_symlink() or not p.is_dir()
               for p in (webroot, driver_dir, passenger_dir)):
            reject("Diretório Web ativo ausente ou com symlink")
        target = driver_dir / "gps2d"
        if target.exists() or target.is_symlink():
            reject("Pasta /motorista/gps2d já existe. Não sobrepor instalação")
        main_files = [driver_dir / "index.html", driver_dir / "main.dart.js",
                      passenger_dir / "index.html"]
        if any(not p.is_file() or p.is_symlink() for p in main_files):
            reject("Arquivos de produção ausentes")
        hashes_before = [hash_file(p) for p in main_files]

        outer = safe_zip(archive_path.read_bytes(), MAX_OUTER, False)
        if set(outer) != EXACT_OUTER:
            reject("Artefato externo inesperado (não é o ZIP oficial do workflow)")
        inner = outer["ramo-motorista-gps2d-vps-web.zip"]
        checksum = hashlib.sha256(inner).hexdigest()
        sums = outer["SHA256SUMS"].decode("ascii").strip()
        # sha256sum in GitHub Actions records "artifacts/<filename>".
        parts = sums.split()
        if (len(parts) != 2 or parts[0] != checksum or
            parts[1].removeprefix("*") not in (
                "artifacts/ramo-motorista-gps2d-vps-web.zip",
                "ramo-motorista-gps2d-vps-web.zip",
            )):
            reject("SHA-256 do bundle interno não coincide")
        files = safe_zip(inner, MAX_INNER, True)
        required = {"index.html", "main.dart.js", "flutter_bootstrap.js",
                    "ramo_push_config.js", "ramo_web_push.js", "manifest.json"}
        if not required.issubset(files):
            reject("Arquivos Web obrigatórios faltando no bundle")
        index = files["index.html"]
        script = files["main.dart.js"]
        if b'<base href="/motorista/gps2d/">' not in index:
            reject("Caminho-base da versão de teste incorreto")
        if (b"__RAMO_GOOGLE_MAPS_WEB_KEY__" in index or
            b"WEB_KEY_NOT_CONFIGURED_FOR_CI" in index):
            reject("Chave Maps Web placeholder; não instalar")
        if EXPECTED_MAP_ID.encode() not in script:
            reject("Map ID vetorial aprovado ausente no app compilado")
        if any(".." in PurePosixPath(name).parts for name in files):
            reject("Tentativa de path traversal")

        staged = Path(tempfile.mkdtemp(prefix=".gps2d-stage-", dir=driver_dir))
        activated = False
        try:
            for name, data in files.items():
                destination = staged / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)
                destination.chmod(0o644)
            for folder in staged.rglob("*"):
                if folder.is_dir():
                    folder.chmod(0o755)
            staged.chmod(0o755)
            if target.exists():
                reject("Instalação concorrente detectada")
            os.rename(staged, target)
            activated = True
            if [hash_file(p) for p in main_files] != hashes_before:
                reject("Arquivo de produção mudou; intervenção recusada")
            public_check(hashlib.sha256(index).hexdigest())
            if [hash_file(p) for p in main_files] != hashes_before:
                reject("Alteração concorrente na versão principal")
        except Exception:
            if activated:
                shutil.rmtree(target)
            else:
                shutil.rmtree(staged, ignore_errors=True)
            raise
        print("INSTALAÇÃO DE TESTE CONCLUÍDA (sem reiniciar Gateway).")
        print("Abrir (arquivo direto; a rota com barra pode cair no index antigo):", URL)
        print("Web principal, passageiro e serviços preservados.")
        print("ATENÇÃO: rota é teste; confirme visualmente ruas girando (Map ID VECTOR).")
        print("Para remover após o teste: sudo rm -rf -- " + str(target))

if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except Exception as error:
        print("NÃO INSTALADO: " + str(error), file=sys.stderr)
        sys.exit(1)

"""Validate a pinned driver-only archive and stage public files outside the active release."""
import argparse, hashlib, io, json, os, re, stat, zipfile
from pathlib import Path, PurePosixPath

MAX_ARCHIVE=128*1024*1024
MAX_EXPANDED=512*1024*1024
SOURCE="7f8fb3735e2096b1516435f36b1d44cde255a1ce"

def fail(message):
    raise ValueError(message)

def unique_object(pairs):
    result={}
    for key,value in pairs:
        if key in result: fail("Campo JSON duplicado.")
        result[key]=value
    return result

def safe_path(value):
    if not isinstance(value,str) or not value or any(c in value for c in ("\\", "\x00", ":")):
        fail("Caminho inválido no pacote.")
    path=PurePosixPath(value)
    if not path.parts or path.is_absolute() or any(part in ("", ".", "..") for part in path.parts) or path.as_posix()!=value:
        fail("Caminho inseguro no pacote.")
    return value

def validate_and_stage(archive, expected_sha, output):
    if not re.fullmatch(r"[a-f0-9]{64}",expected_sha): fail("Checksum inválido.")
    fd=os.open(archive,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,"rb") as stream:
        info=os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size>MAX_ARCHIVE: fail("Arquivo ZIP inválido ou muito grande.")
        data=stream.read(MAX_ARCHIVE+1)
    if len(data)>MAX_ARCHIVE or hashlib.sha256(data).hexdigest()!=expected_sha:
        fail("ZIP diferente do pacote aprovado.")
    with zipfile.ZipFile(io.BytesIO(data)) as bundle:
        entries=bundle.infolist()
        names=set()
        folded=set()
        total=0
        if not entries or len(entries)>5000: fail("Quantidade de arquivos inesperada.")
        for entry in entries:
            name=safe_path(entry.filename)
            if name in names or name.casefold() in folded: fail("Arquivos duplicados no ZIP.")
            names.add(name);folded.add(name.casefold())
            kind=stat.S_IFMT(entry.external_attr>>16)
            if entry.is_dir() or kind not in (0,stat.S_IFREG) or entry.flag_bits&1:
                fail("Entrada especial ou criptografada no ZIP.")
            if entry.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED):
                fail("Compressão inesperada.")
            if entry.file_size>128*1024*1024: fail("Arquivo individual muito grande.")
            total+=entry.file_size
        if total>MAX_EXPANDED or "release.driver.json" not in names:
            fail("Manifesto ausente ou pacote muito grande.")
        if bundle.getinfo("release.driver.json").file_size>2*1024*1024: fail("Manifesto muito grande.")
        manifest_bytes=bundle.read("release.driver.json")
        manifest=json.loads(manifest_bytes,object_pairs_hook=unique_object)
        expected={
            "schemaVersion":1,"role":"driver","sourceCommit":SOURCE,
            "expectedOrigin":"https://app.ramonessa.com.br","expectedProject":"ramo-nessa",
            "basePath":"/motorista/","compiledFinanceTerms":True,
            "browserLoginChromium":True,"browserLoginWebKit":True,
            "realProviderAcceptance":False,
        }
        if not isinstance(manifest,dict) or any(type(manifest.get(k)) is not type(v) or manifest.get(k)!=v for k,v in expected.items()):
            fail("Manifesto não corresponde ao motorista aprovado.")
        if not isinstance(manifest.get("publicConfigSha256"),str) or not re.fullmatch(r"[a-f0-9]{64}",manifest["publicConfigSha256"]):
            fail("Hash da configuração pública inválido.")
        records=manifest.get("files")
        if not isinstance(records,list) or not records: fail("Lista de arquivos inválida.")
        declared={}
        for record in records:
            if not isinstance(record,dict) or set(record)!={"path","bytes","sha256"}: fail("Registro de arquivo inválido.")
            path=safe_path(record["path"])
            if path in declared or type(record["bytes"]) is not int or record["bytes"]<0:
                fail("Registro de arquivo duplicado ou tamanho inválido.")
            if not isinstance(record["sha256"],str) or not re.fullmatch(r"[a-f0-9]{64}",record["sha256"]):
                fail("Hash de arquivo inválido.")
            declared[path]=record
        if names!={"release.driver.json",*("driver/"+p for p in declared)}:
            fail("O pacote contém arquivos fora do manifesto do motorista.")
        required={"index.html","manifest.json","main.dart.js","flutter_bootstrap.js","ramo_push_config.js","ramo_push_worker.js","ramo_web_push.js"}
        if not required.issubset(declared): fail("Arquivos obrigatórios ausentes.")
        if any(p.startswith("ramo_entry_gate.") for p in declared):
            fail("A tela de bloqueio removida não pode voltar ao pacote.")
        # Read/hash all entries before creating a directory.
        contents={}
        for path,record in declared.items():
            entry=bundle.getinfo("driver/"+path)
            if entry.file_size!=record["bytes"]: fail("Tamanho divergiu do manifesto.")
            content=bundle.read(entry)
            if len(content)!=record["bytes"] or hashlib.sha256(content).hexdigest()!=record["sha256"]:
                fail("Conteúdo divergiu do manifesto.")
            contents[path]=content
        if b'<base href="/motorista/">' not in contents["index.html"]: fail("Rota do motorista inválida.")
        if b"__RAMO_GOOGLE_MAPS_WEB_KEY__" in contents["index.html"] or b"WEB_KEY_NOT_CONFIGURED_FOR_CI" in contents["index.html"]:
            fail("Chave Maps de revisão não pode ser publicada.")
        for field in ("anticipationMinimumCents","anticipationFeeCents","expectedMinimumCents","expectedFeeCents"):
            if field.encode() not in contents["main.dart.js"]: fail("Contrato financeiro compilado ausente.")
        output=Path(output)
        if output.exists() or output.is_symlink(): fail("Destino de preparação já existe.")
        output.mkdir(mode=0o755)
        output.chmod(0o755)
        for path,content in contents.items():
            destination=output/path
            destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(content)
            destination.chmod(0o644)
        for directory in output.rglob("*"):
            if directory.is_dir(): directory.chmod(0o755)
        return {"files":len(declared),"expandedBytes":total,"manifestSha256":hashlib.sha256(manifest_bytes).hexdigest(),"manifest":manifest}

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--archive",required=True)
    parser.add_argument("--sha256",required=True)
    parser.add_argument("--output",required=True)
    args=parser.parse_args()
    try:
        result=validate_and_stage(args.archive,args.sha256,args.output)
        print(json.dumps(result,ensure_ascii=False))
    except Exception as error:
        raise SystemExit(str(error))

"""Validate and stage the exact configured CI artifact. No network or provider calls."""
import hashlib,json,stat,zipfile
from pathlib import Path,PurePosixPath
META=json.loads(Path(__file__).with_name("web-refresh-release.json").read_text())
TARGET=META["target"]
ARCHIVE_SHA=META["archiveSha256"]
MANIFEST_SHA=META["manifestSha256"]
OMITTED={}
def sha(path):
 h=hashlib.sha256()
 with Path(path).open("rb") as stream:
  for chunk in iter(lambda:stream.read(1024*1024),b""):h.update(chunk)
 return h.hexdigest()
def relative(value):
 p=PurePosixPath(value)
 if not value or p.is_absolute() or ".." in p.parts or "\\" in value or "\x00" in value or p.as_posix()!=value:raise ValueError("Unsafe bundle path")
 return p
def zip_entries(archive):
 seen=set();total=0
 for item in archive.infolist():
  name=item.filename.rstrip("/");p=relative(name)
  if name in seen:raise ValueError("Duplicate ZIP entry")
  seen.add(name)
  if p.parts[0] not in ("passenger","driver","release.json"):raise ValueError("Unexpected artifact member")
  kind=stat.S_IFMT(item.external_attr>>16)
  if kind not in (0,stat.S_IFREG,stat.S_IFDIR):raise ValueError("Special ZIP entry")
  total+=item.file_size
  if total>500*1024*1024:raise ValueError("Bundle too large")
 return seen
def verify_tree(root,manifest,approved,allow_omitted=False):
 if manifest.get("commit")!=TARGET or manifest.get("schemaVersion")!=1 or manifest.get("expectedProject")!="ramo-nessa" or manifest.get("expectedOrigin")!="https://app.ramonessa.com.br" or set(manifest.get("roles",{}))!={"passenger","driver"}:raise ValueError("Wrong bundle provenance")
 omitted=[];actual_files={}
 for role,data in manifest["roles"].items():
  expected=set();tree=hashlib.sha256()
  for entry in data["files"]:
   path=relative(entry["path"]);key=path.as_posix()
   if key in expected:raise ValueError("Duplicate manifest path")
   expected.add(key);f=root/role/path
   tree.update((key+"\0"+entry["sha256"]+"\0"+str(entry["bytes"])+"\n").encode())
   if not f.exists():
    if allow_omitted and OMITTED.get((role,key))==(entry["bytes"],entry["sha256"]):omitted.append(role+"/"+key);continue
    raise ValueError("Missing runtime bundle file")
   if f.is_symlink() or not f.is_file() or f.stat().st_size!=entry["bytes"] or sha(f)!=entry["sha256"]:raise ValueError("Runtime bundle checksum differs")
  if tree.hexdigest()!=data["treeSha256"]:raise ValueError("Manifest tree digest differs")
  actual=set()
  for f in (root/role).rglob("*"):
   if f.is_symlink():raise ValueError("Bundle symlink")
   if f.is_file():actual.add(f.relative_to(root/role).as_posix())
  if actual-expected:raise ValueError("Unlisted bundle files")
  actual_files[role]=len(actual)
  # Parse the generated JSON only; do not execute JavaScript from an archive.
  import re
  source=(root/role/"ramo_push_config.js").read_text()
  match=re.fullmatch(r"//[^\n]*\nself\.ramoPushConfig = ([\s\S]+);\s*",source)
  if not match or json.loads(match.group(1))!=approved["apps"][role]:raise ValueError("Firebase configuration differs from approved role")
 return {"sourceCommit":TARGET,"archiveSha256":ARCHIVE_SHA,"runtimeFileCounts":actual_files,"omittedBuildMetadata":sorted(omitted),"runtimeHashesVerified":True}
def stage(archive,destination,config):
 archive=Path(archive);destination=Path(destination)
 if archive.is_symlink() or not archive.is_file() or sha(archive)!=ARCHIVE_SHA:raise ValueError("Artifact SHA-256 differs from approved CI archive")
 if destination.exists():raise ValueError("Destination already exists")
 with zipfile.ZipFile(archive) as z:
  zip_entries(z)
  manifest_bytes=z.read("release.json")
  if hashlib.sha256(manifest_bytes).hexdigest()!=MANIFEST_SHA:raise ValueError("Manifest SHA-256 differs")
  destination.mkdir(parents=True,mode=0o755)
  for item in z.infolist():
   p=destination/PurePosixPath(item.filename)
   if item.is_dir():p.mkdir(parents=True,exist_ok=True,mode=0o755);continue
   p.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
   with z.open(item) as src,p.open("xb") as out:
    import shutil
    shutil.copyfileobj(src,out)
   p.chmod(0o644)
 result=verify_tree(destination,json.loads(manifest_bytes),json.loads(Path(config).read_text()))
 (destination.parent/"bundle-verification.json").write_text(json.dumps(result,indent=2)+"\n")
 print("PACOTE VERIFICADO. Todos os arquivos do manifesto estão presentes e íntegros.")
 return result
if __name__=="__main__":
 import sys
 try:
  if len(sys.argv)!=4:raise ValueError("Use archive destination public_config")
  if sys.argv[1]=="--check":
   root=Path(sys.argv[2]);manifest=root/"release.json"
   if root.is_symlink() or manifest.is_symlink() or sha(manifest)!=MANIFEST_SHA:raise ValueError("Manifest differs")
   verify_tree(root,json.loads(manifest.read_text()),json.loads(Path(sys.argv[3]).read_text()))
   print("PACOTE EXISTENTE VERIFICADO. Todos os arquivos conferidos.")
  else:stage(*sys.argv[1:])
 except Exception:
  print("Pacote não pôde ser validado. Nenhuma publicação foi realizada.",file=sys.stderr);sys.exit(1)

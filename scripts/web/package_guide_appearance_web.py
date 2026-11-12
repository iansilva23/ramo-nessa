"""Package the tested Passenger Web with an inventory verified by its pinned installer."""
import hashlib, json, pathlib, zipfile
root=pathlib.Path("apps/passenger/build/web")
digest=lambda b:hashlib.sha256(b).hexdigest()
files=[{"path":p.relative_to(root).as_posix(),"bytes":p.stat().st_size,"sha256":digest(p.read_bytes())} for p in sorted(root.rglob("*")) if p.is_file()]
manifest={"schemaVersion":1,"role":"passenger","sourceCommit":"de3267ea2543d8b499f1a430aa20533173c9553f","expectedOrigin":"https://app.ramonessa.com.br","expectedProject":"ramo-nessa","basePath":"/passageiro/","guideAppearanceModes":["light","dark"],"browserLoginChromium":True,"browserLoginWebKit":True,"realProviderAcceptance":False,"publicConfigSha256":digest(pathlib.Path("config/web/firebase.public.json").read_bytes()),"files":files}
with zipfile.ZipFile("RamoNessa-Guia-Claro-Escuro-Web.zip","w",zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    archive.writestr("release.passenger.json",json.dumps(manifest,ensure_ascii=False))
    for f in files: archive.write(root/f["path"],"passenger/"+f["path"])

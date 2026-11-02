// Read-only inventory for the chat update. No credentials or user records are printed.
import {spawnSync} from 'node:child_process';
const fingerprintProgram = "import {readdirSync,readFileSync,existsSync} from 'node:fs';\nimport {join,relative} from 'node:path';\nimport {createHash} from 'node:crypto';\nconst root=process.argv[1],lock=process.argv[2];\nif(!root)throw Error('Source tree required.');\nconst digest=bytes=>createHash('sha256').update(bytes).digest('hex');\nconst entries=[];\nfunction walk(dir){\n  for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){\n    const file=join(dir,item.name);\n    if(item.isSymbolicLink())throw Error('Unexpected symbolic link in source tree.');\n    if(item.isDirectory())walk(file);\n    else if(item.isFile()&&item.name.endsWith('.js'))entries.push([relative(root,file).split('\\\\').join('/'),digest(readFileSync(file))]);\n  }\n}\nwalk(root);\nif(!entries.length)throw Error('Empty source tree.');\nentries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);\nconst grouped={};\nfor(const row of entries){\n  const group=row[0]==='server.js'?'server':row[0].includes('/')?row[0].split('/')[0]:'root';\n  (grouped[group]??=[]).push(row);\n}\nconst groups=Object.fromEntries(Object.keys(grouped).sort().map(key=>[key,{files:grouped[key].length,sha256:digest(JSON.stringify(grouped[key]))}]));\nconsole.log(JSON.stringify({format:1,source:{files:entries.length,sha256:digest(JSON.stringify(entries)),groups},packageLockSha256:lock&&existsSync(lock)?digest(readFileSync(lock)):null}));";
function run(args) {
  const r = spawnSync('docker', args, {encoding:'utf8', timeout:20000, maxBuffer:4*1024*1024});
  if (r.error || r.status !== 0) throw Error('Inspeção interrompida. Confira se os containers estão ativos. Nenhuma alteração foi feita.');
  return r.stdout.trim();
}
const roles = ['core', 'gateway'];
const services = Object.fromEntries(roles.map(role => {
  const name = `ramo-nessa-staging-${role}-1`;
  // Select fields inside Docker; never retrieve Config.Env or arbitrary labels.
  const projection = '{"id":{{json .Id}},"imageId":{{json .Image}},"status":{{json .State.Status}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}';
  return [role, {name, ...JSON.parse(run(['inspect', '--format', projection, name]))}];
}));
const core = JSON.parse(run(['exec', services.core.name, 'node', '--input-type=module', '-e',
  fingerprintProgram, '/app/dist/src', '/app/package-lock.json']));
const mounts = JSON.parse(run(['inspect', '--format', '{{json .Mounts}}', services.gateway.name]))
  .filter(m => ['/srv/web', '/etc/caddy/Caddyfile'].includes(m.Destination))
  .map(m => ({destination:m.Destination, source:m.Source, readOnly:m.RW === false}));
const webHashes = run(['exec', services.gateway.name, 'sha256sum',
  '/srv/web/driver/main.dart.js', '/srv/web/driver/index.html',
  '/srv/web/passenger/main.dart.js', '/srv/web/passenger/index.html', '/etc/caddy/Caddyfile']);
console.log(JSON.stringify({inspection:'ride-chat-web',readOnly:true,services,core,mounts,webHashes}, null, 2));

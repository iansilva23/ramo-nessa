// Transform the approved Google Web pair without recompiling Flutter or changing providers.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]??'approved');
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const role of ['passenger','driver']){
  const dir=join(root,role),index=join(dir,'index.html'),before=readFileSync(index,'utf8');
  const target=before.replace(/^.*<link rel="stylesheet" href="ramo_entry_gate\.css">[^\n]*\n/m,'').replace(/^.*<script src="ramo_entry_gate\.js"><\/script>[^\n]*\n/m,'');
  if(target===before||target.includes('ramo_entry_gate'))throw Error('Expected exact old entry includes.');
  const source=readFileSync('apps/'+role+'/web/index.html','utf8');
  const baseSource=process.env.RAMO_DIRECT_BASE_INDEX_ROOT;
  if(baseSource){
    const old=readFileSync(join(baseSource,role,'index.html'),'utf8');
    if(before!==old)throw Error('Unexpected initial index.');
  }
  // Source index must also be direct; configured Maps keys in the approved index stay intact.
  if(source.includes('ramo_entry_gate'))throw Error('Source still imports the removed surface.');
  const mainBefore=hash(readFileSync(join(dir,'main.dart.js')));
  writeFileSync(index,target);
  for(const name of ['ramo_entry_gate.js','ramo_entry_gate.css'])unlinkSync(join(dir,name));
  if(hash(readFileSync(join(dir,'main.dart.js')))!==mainBefore)throw Error('Flutter code changed.');
}
console.log('DIRECT ENTRY: removed only two entry includes and two assets per role; compiled Flutter unchanged.');

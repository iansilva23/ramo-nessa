import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SiteError } from './site-content.ts';
export function assetDirectory() { return join(dirname(process.env.INTERESTS_DB_PATH??'/var/lib/ramo-site/interests.sqlite'),'assets'); }
export async function receiveAsset(request: Request, kind: string) {
  const limit=kind==='apk'?150*1024*1024:8*1024*1024;
  const declared=Number(request.headers.get('content-length')??0);
  if(declared>limit)throw new SiteError(413,'Arquivo maior que o limite permitido.');
  const folder=assetDirectory();await mkdir(folder,{recursive:true,mode:0o700});
  const temp=join(folder,'.upload-'+randomUUID());const file=await open(temp,'wx+',0o600);
  let size=0;const hash=createHash('sha256');const reader=request.body?.getReader();
  if(!reader){await file.close();await unlink(temp);throw new SiteError(400,'Arquivo vazio.');}
  try {
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new SiteError(413,'Arquivo maior que o limite permitido.');hash.update(value);await file.write(value);}
    if(size<12)throw new SiteError(400,'Arquivo inválido.');
    const head=Buffer.alloc(12);await file.read(head,0,12,0);
    let extension='',mime='';
    if(kind==='image'){
      if(head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){extension='png';mime='image/png';}
      else if(head[0]===255&&head[1]===216&&head[2]===255){extension='jpg';mime='image/jpeg';}
      else if(head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP'){extension='webp';mime='image/webp';}
      else throw new SiteError(400,'Use uma imagem PNG, JPEG ou WebP.');
    }else{
      if(head.readUInt32LE(0)!==0x04034b50)throw new SiteError(400,'O arquivo não é um APK válido.');
      // Inspect the ZIP central directory without extracting or executing the APK.
      const length=Math.min(size,65557);const tail=Buffer.alloc(length);await file.read(tail,0,length,size-length);
      let eocd=-1;for(let i=length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===length){eocd=i;break;}
      if(eocd<0)throw new SiteError(400,'APK incompleto.');
      const directorySize=tail.readUInt32LE(eocd+12),offset=tail.readUInt32LE(eocd+16);
      if(directorySize>8*1024*1024||offset+directorySize>size-length+eocd)throw new SiteError(400,'APK inválido.');
      const central=Buffer.alloc(directorySize);await file.read(central,0,directorySize,offset);
      let manifest=false;for(let i=0;i+46<=central.length;){if(central.readUInt32LE(i)!==0x02014b50)throw new SiteError(400,'APK inválido.');const n=central.readUInt16LE(i+28),extra=central.readUInt16LE(i+30),comment=central.readUInt16LE(i+32);if(i+46+n+extra+comment>central.length)throw new SiteError(400,'APK inválido.');if(central.toString('utf8',i+46,i+46+n)==='AndroidManifest.xml')manifest=true;i+=46+n+extra+comment;}
      if(!manifest)throw new SiteError(400,'O arquivo não contém um aplicativo Android.');extension='apk';mime='application/vnd.android.package-archive';
    }
    await file.sync();await file.close();const id=hash.digest('hex');await rename(temp,join(folder,id+'.'+extension));await chmod(join(folder,id+'.'+extension),0o600);
    return {id,extension,mime,size,path:'/media/'+id+'.'+extension};
  }catch(e){await reader.cancel().catch(()=>{});await file.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}
}

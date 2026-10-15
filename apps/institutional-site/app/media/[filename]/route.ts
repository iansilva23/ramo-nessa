import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { siteManagement } from '@/db/site-management';
import { assetDirectory } from '@/lib/site-files';
import { authorizeSite, SITE_SCOPES } from '@/lib/site-auth';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{filename:string}>}){
  const {filename}=await params;const match=/^([a-f0-9]{64})\.(apk|png|jpg|webp)$/.exec(filename);
  if(!match)return new Response(null,{status:404});
  const store=siteManagement();const asset=store.asset(match[1],match[2]);
  if(!asset)return new Response(null,{status:404});
  const published=store.isPublishedAsset('/media/'+filename);
  if(!published){try{await authorizeSite(request,SITE_SCOPES.contentRead);}catch{return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});}}
  const path=join(assetDirectory(),filename);let size:number;
  try{size=(await stat(path)).size;}catch{return new Response(null,{status:404});}
  let start=0,end=size-1,status=200;const range=request.headers.get('range');
  if(range){const r=/^bytes=(\d+)-(\d*)$/.exec(range);if(!r)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});start=Number(r[1]);end=r[2]?Math.min(Number(r[2]),size-1):end;if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206;}
  const headers:Record<string,string>={'Content-Type':String(asset.mime),'X-Content-Type-Options':'nosniff','Cache-Control':published?'public, max-age=3600':'no-store','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Content-Security-Policy':"default-src 'none'; sandbox"};
  if(match[2]==='apk')headers['Content-Disposition']=`attachment; filename="ramo-nessa-${match[1].slice(0,12)}.apk"`;
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(createReadStream(path,{start,end})) as ReadableStream,{status,headers});
}

import {createHash,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {GuideError,mutateGuide,publicGuide,type GuideState} from './guide.js';
export interface GuideImage {id:string;mime:string;bytes:Buffer;}
export interface GuideHistory {id:string;createdAt:string;actor:string;state:GuideState;}
export interface GuideStore {published():Promise<ReturnType<typeof publicGuide>>;read():Promise<GuideState>;write(body:unknown,actor:string):Promise<GuideState>;history():Promise<GuideHistory[]>;image(id:string):Promise<GuideImage|null>;upload(mime:string,bytes:Buffer):Promise<string>;}
export class MemoryGuideStore implements GuideStore {
  private state:GuideState;private images=new Map<string,GuideImage>();private versions:GuideHistory[]=[];
  constructor(initial:GuideState={revision:0,entities:[]}){this.state=structuredClone(initial);}
  async published(){return publicGuide(await this.read());}
  async read(){return structuredClone(this.state);}
  async write(body:unknown,actor:string){const next=mutateGuide(this.state,body);assertImages(next,new Set(this.images.keys()));this.state=next;this.versions.unshift({id:randomUUID(),createdAt:new Date().toISOString(),actor,state:structuredClone(next)});return this.read();}
  async history(){return structuredClone(this.versions.slice(0,30));}
  async image(id:string){return this.images.get(id)??null;}
  async upload(mime:string,bytes:Buffer){const id=createHash('sha256').update(bytes).digest('hex');this.images.set(id,{id,mime,bytes});return id;}
}
function assertImages(state:GuideState,ids:Set<string>){for(const e of state.entities){const image=e.draft.image;if(image&&!ids.has(image.split('/').at(-1)!))throw new GuideError('GUIDE_IMAGE_MISSING','A foto não foi encontrada. Envie novamente.');}}
export class PostgresGuideStore implements GuideStore {
  private publicCache:ReturnType<typeof publicGuide>|null=null;
  private publicLoading:Promise<ReturnType<typeof publicGuide>>|null=null;
  constructor(private readonly pool:Pool){}
  async published(){
    const revision=await this.pool.query('SELECT revision FROM local_guide_catalog WHERE id=1');
    if(this.publicCache&&this.publicCache.revision===revision.rows[0]?.revision)return this.publicCache;
    return this.publicLoading??=this.read().then(state=>{this.publicCache=publicGuide(state);return this.publicCache;}).finally(()=>{this.publicLoading=null;});
  }
  async read():Promise<GuideState>{const r=await this.pool.query('SELECT revision, entities FROM local_guide_catalog WHERE id=1');if(!r.rows[0])throw new GuideError('GUIDE_NOT_PREPARED','O Guia Local precisa da atualização do banco.',503);return r.rows[0] as GuideState;}
  async write(body:unknown,actor:string){const c=await this.pool.connect();try{
    await c.query('BEGIN');const r=await c.query('SELECT revision, entities FROM local_guide_catalog WHERE id=1 FOR UPDATE');if(!r.rows[0])throw new GuideError('GUIDE_NOT_PREPARED','O Guia Local precisa da atualização do banco.',503);
    const next=mutateGuide(r.rows[0] as GuideState,body),ids=next.entities.map(e=>e.draft.image.split('/').at(-1)).filter(Boolean);
    const images=await c.query('SELECT id FROM local_guide_images WHERE id=ANY($1::text[])',[ids]);assertImages(next,new Set(images.rows.map(r=>r.id)));
    await c.query('UPDATE local_guide_catalog SET revision=$1, entities=$2::jsonb WHERE id=1',[next.revision,JSON.stringify(next.entities)]);
    await c.query('INSERT INTO local_guide_history(id,revision,entities,actor) VALUES($1,$2,$3::jsonb,$4)',[randomUUID(),next.revision,JSON.stringify(next.entities),actor]);await c.query('COMMIT');return next;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
  async history():Promise<GuideHistory[]>{const r=await this.pool.query('SELECT id,revision,entities,actor,created_at FROM local_guide_history ORDER BY revision DESC LIMIT 30');return r.rows.map(r=>({id:r.id,createdAt:new Date(r.created_at).toISOString(),actor:r.actor,state:{revision:r.revision,entities:r.entities}}));}
  async image(id:string){const r=await this.pool.query('SELECT id,mime,bytes FROM local_guide_images WHERE id=$1',[id]);return r.rows[0]??null;}
  async upload(mime:string,bytes:Buffer){const id=createHash('sha256').update(bytes).digest('hex');await this.pool.query('INSERT INTO local_guide_images(id,mime,bytes) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,mime,bytes]);return id;}
}
export async function guideImagePublic(store:GuideStore,id:string){return (await store.published()).entities.some(e=>e.image.endsWith('/'+id));}

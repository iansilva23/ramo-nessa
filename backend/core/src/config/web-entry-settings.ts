import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {AdminActor,AdminRepository} from '../admin/admin-repository.js';
import {PostgresAdminRepository} from '../admin/repositories/postgres-admin-repository.js';

export interface WebEntrySettings {enabled:boolean;revision:number;updatedAt:string;}
export interface WebEntrySettingsRepository {
  get():Promise<WebEntrySettings>;
  save(input:{enabled:boolean;expectedRevision:number;actor:AdminActor}):Promise<WebEntrySettings>;
}
export class WebEntrySettingsError extends Error {
  constructor(public readonly status:number,public readonly code:string,message:string){super(message);}
}
export function parseWebEntryUpdate(body:unknown):{enabled:boolean;expectedRevision:number}{
  if(body===null||typeof body!=='object'||Array.isArray(body))throw new WebEntrySettingsError(400,'INVALID_WEB_ENTRY_SETTINGS','Informe a configuração da tela de entrada.');
  const b=body as Record<string,unknown>;
  if(Object.keys(b).some(k=>!['enabled','expectedRevision'].includes(k))||typeof b.enabled!=='boolean'||!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0)throw new WebEntrySettingsError(400,'INVALID_WEB_ENTRY_SETTINGS','Informe ativado/desativado e a revisão atual.');
  return {enabled:b.enabled,expectedRevision:Number(b.expectedRevision)};
}
const audit=(actor:AdminActor,before:WebEntrySettings,after:WebEntrySettings)=>({
  id:randomUUID(),actor,action:'web_entry_settings.updated',targetType:'web_entry_settings',targetId:'installed-web',
  metadata:{previousEnabled:before.enabled,enabled:after.enabled,previousRevision:before.revision,revision:after.revision},createdAt:after.updatedAt,
});
const conflict=()=>new WebEntrySettingsError(409,'WEB_ENTRY_SETTINGS_CONFLICT','Outra pessoa alterou esta configuração. Atualize os dados antes de salvar novamente.');

export class MemoryWebEntrySettingsRepository implements WebEntrySettingsRepository {
  private value:WebEntrySettings={enabled:false,revision:0,updatedAt:'1970-01-01T00:00:00.000Z'};
  private queue:Promise<void>=Promise.resolve();
  constructor(private readonly admin:AdminRepository){}
  async get(){return structuredClone(this.value);}
  async save(input:{enabled:boolean;expectedRevision:number;actor:AdminActor}){
    const previous=this.queue;let release!:()=>void;this.queue=new Promise(r=>{release=r;});await previous;
    try{
      const current=await this.get();if(current.revision!==input.expectedRevision)throw conflict();
      if(current.enabled===input.enabled)return current;
      const next={enabled:input.enabled,revision:current.revision+1,updatedAt:new Date().toISOString()};
      await this.admin.appendAudit(audit(input.actor,current,next));this.value=next;return structuredClone(next);
    }finally{release();}
  }
}
interface Row {web_entry_gate_enabled:boolean;web_entry_gate_revision:number;web_entry_gate_updated_at:Date;}
const view=(r:Row):WebEntrySettings=>({enabled:r.web_entry_gate_enabled,revision:r.web_entry_gate_revision,updatedAt:r.web_entry_gate_updated_at.toISOString()});
const columns='web_entry_gate_enabled,web_entry_gate_revision,web_entry_gate_updated_at';
export class PostgresWebEntrySettingsRepository implements WebEntrySettingsRepository {
  constructor(private readonly pool:Pool){}
  async get(){
    const result=await this.pool.query<Row>('SELECT '+columns+' FROM operational_settings WHERE id=1');
    if(!result.rows[0])throw Error('Configuração de entrada não inicializada.');return view(result.rows[0]);
  }
  async save(input:{enabled:boolean;expectedRevision:number;actor:AdminActor}){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const selected=await client.query<Row>('SELECT '+columns+' FROM operational_settings WHERE id=1 FOR UPDATE');
      if(!selected.rows[0])throw Error('Configuração de entrada não inicializada.');
      const current=view(selected.rows[0]);if(current.revision!==input.expectedRevision)throw conflict();
      if(current.enabled===input.enabled){await client.query('COMMIT');return current;}
      const result=await client.query<Row>('UPDATE operational_settings SET web_entry_gate_enabled=$1,web_entry_gate_revision=web_entry_gate_revision+1,web_entry_gate_updated_at=now() WHERE id=1 RETURNING '+columns,[input.enabled]);
      const next=view(result.rows[0]!);
      await new PostgresAdminRepository(client).appendAudit(audit(input.actor,current,next));
      await client.query('COMMIT');return next;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
}

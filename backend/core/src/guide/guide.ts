export const GUIDE_TEMPLATES = ['tours','rules','highlights','events','gastronomy','venues'] as const;
export type GuideKind = 'locality'|'category'|'item';
export type GuideAction = {id:string;type:'route'|'instagram'|'whatsapp'|'website'|'internal'|'none';label:string;primary:boolean;enabled:boolean;url?:string;phone?:string;message?:string;targetId?:string};
export interface GuideData {
  name:string;summary:string;description:string;image:string;imagePosition:number;order:number;
  template?:typeof GUIDE_TEMPLATES[number];filters:string[];tags:string[];featured:boolean;badge:string;icon:string;
  address:string;latitude:number|null;longitude:number|null;duration:string;schedule:string;date:string;
  cuisine:string;source:string;sourceUrl:string;updatedOn:string;priceLabel:string;priceCents:number|null;priceSuffix:string;
  highlights:string[];included:string[];excluded:string[];actions:GuideAction[];
}
export interface GuideEntity { id:string;kind:GuideKind;parentId:string|null;draft:GuideData;published:GuideData|null;archived:boolean; }
export interface GuideState {revision:number;entities:GuideEntity[];}
export class GuideError extends Error {constructor(public code:string,message:string,public status=422){super(message);}}
const fail=(message:string):never=>{throw new GuideError('GUIDE_INVALID',message);};
export function guideId(raw:unknown):string {if(typeof raw!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(raw))return fail('Identificador inválido.');return raw;}
function object(raw:unknown):Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('Preencha as informações do conteúdo.');return raw as Record<string,unknown>;}
function str(raw:unknown,max=280):string {if(raw==null)return '';if(typeof raw!=='string'||raw.length>max)return fail('Um dos textos excede o limite permitido.');return raw.trim();}
function list(raw:unknown):string[]{if(raw==null)return [];if(!Array.isArray(raw)||raw.length>40)return fail('Use até 40 opções.');return [...new Set(raw.map(v=>str(v,180)).filter(Boolean))];}
export function safeGuideUrl(raw:unknown,instagram=false):string {
  const s=str(raw,2048);if(!s)return '';let u:URL;try{u=new URL(s);}catch{return fail('Informe um link completo começando com https://.');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^(localhost|.*\.local|.*\.internal)$/.test(u.hostname)||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':'))return fail('Use um link público HTTPS válido.');
  if(instagram&&!['instagram.com','www.instagram.com'].includes(u.hostname))return fail('Informe um link do Instagram.');return u.href;
}
function numeric(raw:unknown,min:number,max:number,fallback:number|null=null):number|null {if(raw==null||raw==='')return fallback;if(typeof raw!=='number'||!Number.isFinite(raw)||raw<min||raw>max)return fail('Confira as coordenadas ou o valor informado.');return raw;}
export function guideData(raw:unknown):GuideData {
  const o=object(raw),name=str(o.name,120);if(!name)return fail('Preencha o nome.');
  const image=str(o.image,2200);if(image&&!/^\/v1\/content\/guide\/images\/[a-zA-Z0-9_-]{1,100}$/.test(image))return fail('Envie a foto pelo botão de upload.');
  const latitude=numeric(o.latitude,-90,90),longitude=numeric(o.longitude,-180,180);if((latitude==null)!==(longitude==null))return fail('Informe latitude e longitude juntas.');
  const template=o.template==null?undefined:GUIDE_TEMPLATES.find(t=>t===o.template);if(o.template!=null&&!template)return fail('Escolha um modelo da página.');
  if(o.actions!=null&&!Array.isArray(o.actions))return fail('Confira os botões de ação.');
  const actions=Array.isArray(o.actions)?o.actions:[];if(actions.length>12)return fail('Use até 12 botões por conteúdo.');
  const seen=new Set<string>();
  const parsed:GuideAction[]=actions.map(raw=>{
    const a=object(raw),id=guideId(a.id);if(seen.has(id))return fail('Cada botão deve ter um identificador único.');seen.add(id);
    const type=['route','instagram','whatsapp','website','internal','none'].find(t=>t===a.type) as GuideAction['type']|undefined;
    if(!type)return fail('Escolha o tipo do botão.');
    const result:GuideAction={id,type,label:str(a.label,48),primary:a.primary===true,enabled:a.enabled!==false};
    if(type==='instagram'||type==='website')result.url=safeGuideUrl(a.url,type==='instagram');
    if(type==='whatsapp'){result.phone=str(a.phone,20).replace(/[\s()+-]/g,'');result.message=str(a.message,500);if(result.phone&&!/^[1-9][0-9]{9,14}$/.test(result.phone))return fail('Informe WhatsApp com país e DDD.');}
    if(type==='internal'&&a.targetId)result.targetId=guideId(a.targetId);
    return result;
  });
  const order=numeric(o.order,0,100000,0)!;if(!Number.isInteger(order))return fail('A ordem precisa ser um número inteiro.');
  const priceCents=numeric(o.priceCents,0,100000000);if(priceCents!=null&&!Number.isInteger(priceCents))return fail('Preço inválido.');
  const date=str(o.date,40),updatedOn=str(o.updatedOn,10);
  if(date&&!/^\d{4}-\d{2}-\d{2}([T ][0-2]\d:[0-5]\d([:-][0-9Z.+]+)?)?$/.test(date))return fail('Confira a data do evento.');
  if(updatedOn&&!/^\d{4}-\d{2}-\d{2}$/.test(updatedOn))return fail('Confira a data de atualização.');
  return {name,summary:str(o.summary),description:str(o.description,8000),image,imagePosition:numeric(o.imagePosition,0,100,50)!,order,
    ...(template?{template}:{}),filters:list(o.filters),tags:list(o.tags),featured:o.featured===true,badge:str(o.badge,60),icon:str(o.icon,40),
    address:str(o.address,280),latitude,longitude,duration:str(o.duration,100),schedule:str(o.schedule,180),date,cuisine:str(o.cuisine,100),
    source:str(o.source,180),sourceUrl:safeGuideUrl(o.sourceUrl),updatedOn,priceLabel:str(o.priceLabel,40),priceCents,priceSuffix:str(o.priceSuffix,80),
    highlights:list(o.highlights),included:list(o.included),excluded:list(o.excluded),actions:parsed};
}
function visible(state:GuideState,e:GuideEntity,seen=new Set<string>()):boolean {
  if(!e.published||e.archived||seen.has(e.id))return false;seen.add(e.id);
  if(e.kind==='locality')return true;const p=state.entities.find(p=>p.id===e.parentId);return !!p&&visible(state,p,seen);
}
export function publicGuide(state:GuideState){return {revision:state.revision,entities:state.entities.filter(e=>visible(state,e)).map(e=>({id:e.id,kind:e.kind,parentId:e.parentId,...e.published!})).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR'))};}
function validatePublish(state:GuideState,e:GuideEntity){
  const d=e.draft;if(e.kind==='category'&&!d.template)return fail('Escolha o modelo da categoria.');
  if(e.parentId){const parent=state.entities.find(p=>p.id===e.parentId);if(!parent||!visible(state,parent))return fail('Publique primeiro a localidade e a categoria.');}
  for(const a of d.actions.filter(a=>a.enabled)){
    if(a.type==='route'&&(d.latitude==null||d.longitude==null))return fail('Selecione a localização para Calcular rota.');
    if(['instagram','website'].includes(a.type)&&!a.url)return fail('Preencha o link do botão.');
    if(a.type==='whatsapp'&&!a.phone)return fail('Preencha o WhatsApp do botão.');
    if(a.type==='internal'){const target=state.entities.find(t=>t.id===a.targetId);if(!target||!visible(state,target)||target.kind==='locality'||target.id===e.id)return fail('Escolha uma página interna publicada.');}
  }
}
export function mutateGuide(current:GuideState,raw:unknown):GuideState {
  const b=object(raw);if(b.expectedRevision!==current.revision)throw new GuideError('GUIDE_CONFLICT','Outra pessoa atualizou o Guia. Atualize a lista; seu formulário foi preservado.',409);
  const next=structuredClone(current),id=guideId(b.id),op=b.op;let e=next.entities.find(e=>e.id===id);
  if(op==='save'){
    const data=guideData(b.data);
    if(e){if(b.kind!==e.kind||b.parentId!==e.parentId)return fail('A hierarquia deste conteúdo está preservada.');e.draft=data;}
    else{
      if(next.entities.length>=3000)return fail('Limite do catálogo atingido.');
      if(!['locality','category','item'].includes(String(b.kind)))return fail('Tipo de conteúdo inválido.');
      const kind=b.kind as GuideKind,parentId=kind==='locality'?null:guideId(b.parentId);
      const parent=next.entities.find(e=>e.id===parentId);
      if(kind!=='locality'&&(!parent||parent.archived||parent.kind!==(kind==='category'?'locality':'category')))return fail('Selecione a localidade ou categoria.');
      e={id,kind,parentId,draft:data,published:null,archived:false};next.entities.push(e);
    }
  }else{
    if(!e)throw new GuideError('GUIDE_NOT_FOUND','Conteúdo não encontrado.',404);
    if(op==='reorder'){
      const peers=next.entities.filter(p=>p.kind===e!.kind&&p.parentId===e!.parentId&&!p.archived);
      if(!Array.isArray(b.ids)||b.ids.length!==peers.length||new Set(b.ids).size!==peers.length||b.ids.some(id=>!peers.some(p=>p.id===id)))return fail('Atualize a lista antes de reorganizar.');
      for(const [index,id]of b.ids.entries()){const row=peers.find(p=>p.id===id)!;row.draft.order=index;if(row.published)row.published.order=index;}
    }
    else if(op==='publish'){if(e.archived)return fail('Restaure o conteúdo antes de publicar.');validatePublish(next,e);e.published=structuredClone(e.draft);}
    else if(op==='unpublish')e.published=null;
    else if(op==='archive'){e.archived=true;e.published=null;}
    else if(op==='restore')e.archived=false;
    else return fail('Ação inválida.');
  }
  next.revision++;return next;
}

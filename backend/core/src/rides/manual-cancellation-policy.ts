import {normalizeDriverCpf} from '../drivers/driver-cpf.js';
export const cancellationCategories = ['moto','car','buggy','delivery','comfort_black'] as const;
export type CancellationCategory = typeof cancellationCategories[number];
export interface CancellationRule { enabled: boolean; freeSeconds: number; feeCents: number | null }
export type CancellationPolicy = Record<CancellationCategory,CancellationRule>;
export function defaultCancellationPolicy(): CancellationPolicy {
  return Object.fromEntries(cancellationCategories.map(key=>[key,{enabled:false,freeSeconds:40,feeCents:null}])) as CancellationPolicy;
}
export class CancellationError extends Error {
  constructor(public code:string, message:string, public status=409){super(message);}
}
export function validateCancellationPolicy(value: unknown): CancellationPolicy {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new CancellationError('INVALID_POLICY','Configuração inválida.',400);
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join()!==[...cancellationCategories].sort().join())throw new CancellationError('INVALID_POLICY','Configure as cinco categorias.',400);
  for(const key of cancellationCategories){
    const r=v[key] as CancellationRule;
    if(!r||Object.keys(r).sort().join()!=='enabled,feeCents,freeSeconds'||typeof r.enabled!=='boolean'||
      !Number.isInteger(r.freeSeconds)||r.freeSeconds<0||r.freeSeconds>300||
      (r.feeCents!==null&&(!Number.isSafeInteger(r.feeCents)||r.feeCents<0||r.feeCents>100000))||
      (r.enabled&&r.feeCents===null))throw new CancellationError('INVALID_POLICY','Informe prazo entre 0 e 300 segundos e taxa entre R$ 0 e R$ 1.000. Ative somente após definir o valor.',400);
  }
  return structuredClone(value as CancellationPolicy);
}
export interface RefundPix { type:'cpf'|'email'|'phone'|'random'; key:string; holder:string }
export function validateRefundPix(value:unknown): RefundPix {
  const v=value as RefundPix;
  if(!v||!['cpf','email','phone','random'].includes(v.type)||typeof v.key!=='string'||typeof v.holder!=='string')throw new CancellationError('INVALID_PIX','Preencha os dados Pix.',400);
  const key=v.key.trim(),holder=v.holder.trim();
  if(v.type==='cpf'){try{normalizeDriverCpf(key);}catch{throw new CancellationError('INVALID_PIX','Confira os dígitos do CPF da chave Pix.',400);}}
  const valid=v.type==='cpf'?/^\d{11}$/.test(key):v.type==='phone'?/^\+55\d{10,11}$/.test(key):
    v.type==='email'?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key):/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key);
  if(!valid||holder.length<3||holder.length>120||key.length>254)throw new CancellationError('INVALID_PIX','Confira a chave e o nome do titular. CPF sem pontuação; telefone com +55 e DDD.',400);
  return {type:v.type,key,holder};
}
export interface CancellationReceipt { name:string; contentType:string; base64:string }
export function validateCancellationReceipt(v:unknown): CancellationReceipt {
  const r=v as CancellationReceipt;
  if(!r||typeof r.name!=='string'||typeof r.base64!=='string'||!['image/png','image/jpeg','application/pdf'].includes(r.contentType)||r.name.length>160||r.base64.length>700000||!/^[-\w .()]+$/.test(r.name)||!/^[A-Za-z0-9+/]+={0,2}$/.test(r.base64))throw new CancellationError('INVALID_RECEIPT','Envie comprovante PNG, JPEG ou PDF com até 500 KB e nome simples.',400);
  const b=Buffer.from(r.base64,'base64');
  const valid=r.contentType==='application/pdf'?b.subarray(0,5).toString()==='%PDF-':r.contentType==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b[0]===255&&b[1]===216&&b[2]===255;
  if(!valid||b.length===0||b.length>512000)throw new CancellationError('INVALID_RECEIPT','Comprovante inválido ou maior que 500 KB.',400);
  return {name:r.name,contentType:r.contentType,base64:r.base64};
}
export interface CancellationTerms { rule:CancellationRule; acceptedAt:string|null; serverTime:string; cancelUntil:string|null }
export function cancellationTerms(rule:CancellationRule,acceptedAt:string|null,now:Date):CancellationTerms {
  return {rule,acceptedAt,serverTime:now.toISOString(),cancelUntil:acceptedAt===null?null:new Date(Date.parse(acceptedAt)+rule.freeSeconds*1000).toISOString()};
}
export function cancellationFee(input:{rule:CancellationRule;acceptedAt:string|null;now:Date;paidCents:number;passenger:boolean}):number {
  if(input.acceptedAt===null)return 0;
  const elapsed=input.now.getTime()-Date.parse(input.acceptedAt);
  if(!Number.isFinite(elapsed))throw new CancellationError('ACCEPTANCE_UNAVAILABLE','Não foi possível conferir o horário do aceite.');
  if(elapsed>=input.rule.freeSeconds*1000){
    if(input.passenger)throw new CancellationError('FREE_PERIOD_ENDED','O prazo para cancelar pelo app terminou. Fale com o suporte.');
    return input.rule.enabled?Math.min(input.rule.feeCents??0,input.paidCents):0;
  }
  return 0;
}

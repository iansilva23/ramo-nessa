import { SiteError } from './site-content.ts';
export const TRAINING_COOKIE = '__Host-rn_training';
const tokenPattern = /^[A-Za-z0-9_-]{20,4096}$/;
export function requireTrainingOrigin(request: Request) {
  const origin = process.env.PUBLIC_SITE_ORIGIN ?? 'https://ramonessa.com.br';
  if (request.headers.get('origin') !== origin || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) throw new SiteError(403, 'Origem inválida. Reabra a Central do Motorista.');
}
export function trainingToken(request: Request): string {
  const values=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(TRAINING_COOKIE+'='));
  if(values.length!==1)throw new SiteError(401,'Entre com sua conta de motorista.');
  const token=values[0].slice(TRAINING_COOKIE.length+1);
  if(!tokenPattern.test(token))throw new SiteError(401,'Entre novamente.');
  return token;
}
export async function coreTrainingRequest(path:string,init:RequestInit={},fetcher:typeof fetch=fetch) {
  try { return await fetcher(new URL(path,process.env.CORE_INTERNAL_URL??'http://core:8080'),{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)}); }
  catch { throw new SiteError(503,'Não foi possível acessar sua conta agora. Tente novamente.'); }
}
export async function authorizeTraining(request:Request,fetcher:typeof fetch=fetch) {
  const token=trainingToken(request);
  const response=await coreTrainingRequest('/v1/auth/me/check',{headers:{authorization:'Bearer '+token}},fetcher);
  if(!response.ok)throw new SiteError([401,403].includes(response.status)?401:503,'Sua sessão está indisponível. Entre novamente.');
  const user=await response.json();
  if(user.subjectType!=='driver'||typeof user.subjectId!=='string'||!user.subjectId||user.subjectId.length>200)throw new SiteError(403,'Use uma conta de motorista.');
  return {id:user.subjectId as string};
}
export function trainingCookie(token:string,expiresAt:string) {
  if(!tokenPattern.test(token)||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())throw new SiteError(503,'Sessão indisponível.');
  const expires=new Date(Math.min(Date.parse(expiresAt),Date.now()+86400000));
  return `${TRAINING_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`;
}
export const clearTrainingCookie=`${TRAINING_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export function trainingReply(data:unknown,status=200,extra:Record<string,string>={}) { return Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',...extra}}); }
export function trainingError(error:unknown) {
  if(error instanceof SiteError)return trainingReply({message:error.message},error.status);
  if(error instanceof RangeError)return trainingReply({message:'Conteúdo maior que o permitido.'},413);
  return trainingReply({message:'Não foi possível concluir. Tente novamente.'},503);
}

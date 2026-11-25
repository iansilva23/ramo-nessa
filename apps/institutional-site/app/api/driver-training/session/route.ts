import { siteManagement } from '@/db/site-management';
import { isIP } from 'node:net';
import { z } from 'zod';
import { readInterestBody } from '@/lib/interest-request';
import { SiteError } from '@/lib/site-content';
import { trainingToken, requireTrainingOrigin, coreTrainingRequest, trainingCookie, clearTrainingCookie, trainingReply, trainingError } from '@/lib/training-auth';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET() { try { return trainingReply({accessMode:siteManagement().trainingAccess().mode}); } catch(e) { return trainingError(e); } }
export async function POST(request:Request) {
  try {
    requireTrainingOrigin(request);
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new SiteError(415,'Formato inválido.');
    const parsed=z.object({identifier:z.string().trim().min(1).max(254),password:z.string().min(1).max(256)}).strict().safeParse(await readInterestBody(request));
    if(!parsed.success)throw new SiteError(400,'Informe seu usuário ou e-mail e sua senha.');
    // Individual access uses Core limits; shared access has separate persistent limits.
    const clientIp=request.headers.get('x-forwarded-for')?.split(',')[0].trim();
    const store=siteManagement(),access=store.trainingAccess();
    if(access.mode==='public')return trainingReply({ok:true});
    if(access.mode==='shared') {
      const session=store.sharedTrainingLogin(parsed.data.identifier,parsed.data.password,clientIp&&isIP(clientIp)?clientIp:'unknown');
      if('limited' in session)throw new SiteError(429,'Muitas tentativas. Aguarde antes de tentar novamente.');
      if(!session.token||!session.expiresAt)throw new SiteError(401,'Usuário ou senha inválidos.');
      return trainingReply({ok:true},200,{'Set-Cookie':trainingCookie(session.token,session.expiresAt)});
    }
    const response=await coreTrainingRequest('/v1/auth/driver/password/login',{method:'POST',headers:{'content-type':'application/json',...(clientIp&&isIP(clientIp)?{'x-forwarded-for':clientIp}:{})},body:JSON.stringify(parsed.data)});
    if(!response.ok)throw new SiteError(response.status===429?429:response.status===401||response.status===422?401:503,response.status===429?'Muitas tentativas. Aguarde antes de tentar novamente.':'Não foi possível entrar. Confira seu usuário ou e-mail e senha.');
    const session=await response.json();
    if(session.subjectType!=='driver')throw new SiteError(403,'Use uma conta de motorista.');
    return trainingReply({ok:true},200,{'Set-Cookie':trainingCookie(session.accessToken,session.expiresAt)});
  } catch(e) { return trainingError(e); }
}
export async function DELETE(request:Request) {
  try {
    requireTrainingOrigin(request);
    let token:string;try{token=trainingToken(request);}catch{return trainingReply({ok:true},200,{'Set-Cookie':clearTrainingCookie});}
    const store=siteManagement();
    if(store.trainingAccess().mode!=='individual'||store.validTrainingSession(token)) {
      store.deleteTrainingSession(token);return trainingReply({ok:true},200,{'Set-Cookie':clearTrainingCookie});
    }
    const response=await coreTrainingRequest('/v1/auth/session',{method:'DELETE',headers:{authorization:'Bearer '+token}});
    if(!response.ok&&![401,403].includes(response.status))throw new SiteError(503,'Não foi possível sair agora. Tente novamente.');
    return trainingReply({ok:true},200,{'Set-Cookie':clearTrainingCookie});
  } catch(e) { return trainingError(e); }
}

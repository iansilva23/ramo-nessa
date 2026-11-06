import { SiteError } from './site-content.ts';
export type SiteActor = { id: string; name: string; scopes: string[]; capabilities?: { manageStaff?: boolean } };
export async function authorizeSite(request: Request, scope: string, fetcher: typeof fetch = fetch): Promise<SiteActor> {
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer rn_admin_session_[A-Za-z0-9_-]{40,80}$/.test(authorization))throw new SiteError(401,'Entre novamente no ADM.');
  if(request.method!=='GET') {
    const origin=request.headers.get('origin');
    if(origin!==(process.env.ADMIN_SITE_ORIGIN??'https://app.ramonessa.com.br'))throw new SiteError(403,'Origem administrativa inválida.');
  }
  const base=process.env.CORE_INTERNAL_URL??'http://core:8080';
  let response: Response;
  try { response=await fetcher(new URL('/v1/admin/auth/me',base),{headers:{authorization},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)}); }
  catch { throw new SiteError(503,'Não foi possível validar sua sessão agora.'); }
  if(!response.ok)throw new SiteError(response.status===401||response.status===403?401:503,'Não foi possível validar sua sessão.');
  const {user}=await response.json();
  if(!user||typeof user.id!=='string'||!Array.isArray(user.scopes))throw new SiteError(503,'Sessão indisponível.');
  if(!user.scopes.includes(scope))throw new SiteError(403,'Sua conta não tem permissão para esta operação.');
  return user;
}
export const SITE_SCOPES={leadsRead:'drivers:profile:read',leadsWrite:'drivers:profile:write',contentRead:'communications:read',contentWrite:'communications:write'};

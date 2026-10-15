import { siteManagement } from '@/db/site-management';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(){return Response.json(siteManagement().state().published,{headers:{'Cache-Control':'no-store'}});}

import { z } from 'zod';
import { siteManagement } from '@/db/site-management';
import { authorizeTraining, requireTrainingOrigin, trainingReply, trainingError } from '@/lib/training-auth';
import { readInterestBody } from '@/lib/interest-request';
import { SiteError } from '@/lib/site-content';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try { const driver=await authorizeTraining(request);const store=siteManagement();const site=store.state().published;
    return trainingReply({content:store.publicTraining(),completed:store.trainingProgress(driver.id),appHref:site.apps.find(a=>a.id==='motorista')?.webHref||'',supportEmail:site.footer.enabled?site.footer.email:''});
  } catch(e) { return trainingError(e); }
}
export async function PUT(request:Request) {
  try { requireTrainingOrigin(request);const driver=await authorizeTraining(request);
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new SiteError(415,'Formato inválido.');
    const data=z.object({lessonId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),completed:z.boolean()}).strict().safeParse(await readInterestBody(request));
    if(!data.success)throw new SiteError(400,'Aula inválida.');
    const store=siteManagement();store.setTrainingProgress(driver.id,data.data.lessonId,data.data.completed);return trainingReply({completed:store.trainingProgress(driver.id)});
  } catch(e) { return trainingError(e); }
}

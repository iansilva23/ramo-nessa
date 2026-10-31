import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
export const sandboxWebhookPath='/__asaas_sandbox/transfers';
// No payout creation entry point: only authenticated events and canonical reconciliation.
export function createSandboxWebhookServer({token,receive,apply,complete,receipt,healthy}) {
 if(typeof token!=='string'||token.length<32||token.length>255)throw Error('Private webhook token required.');
 const expected=Buffer.from(token);
 const server=createServer(async(req,res)=>{
  const reply=(status)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:status===200}));};
  try{
   if(req.url==='/healthz'&&req.method==='GET'){await healthy();return reply(200);}
   if(req.url!==sandboxWebhookPath)return reply(404);
   if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405);}
   const rawToken=req.headers['asaas-access-token'];
   const actual=Buffer.from(typeof rawToken==='string'?rawToken:'');
   if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return reply(401);
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))return reply(415);
   if(Number(req.headers['content-length']??0)>65536)return reply(413);
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>65536){reply(413);return;}chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400);}
   const event=await receive(token,body);
   if(!event.duplicate&&event.payoutId&&event.result){await apply(event);await complete(body.id);}
   // Acknowledgement follows durable processing. No raw event, key or token in logs.
   await receipt({at:new Date().toISOString(),eventId:body.id,event:body.event,transferId:body.transfer.id,
    localProbe:body.id.startsWith('evt-local-'),duplicate:event.duplicate,payoutId:event.payoutId??null,status:event.result?.status??null});
   reply(200);
  }catch(error){reply(error?.status===400?400:503);}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxConnections=32;
 return server;
}

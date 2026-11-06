import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPublicWebConfiguration } from './public_web_configuration.mjs';
import { validateMapsWebKey } from './maps_web_config.mjs';
const args=process.argv.slice(2);
if(args.length!==1||!/^--role=(passenger|driver)$/.test(args[0]))throw new Error('Uso: --role=passenger|driver');
const role=args[0].slice(7),config=await loadPublicWebConfiguration();
const maps=validateMapsWebKey(process.env.RAMO_GOOGLE_MAPS_WEB_API_KEY);
const values=config.apps[role];
const env={...process.env,RAMO_GOOGLE_MAPS_WEB_API_KEY:maps,
  RAMO_FIREBASE_WEB_API_KEY:values.apiKey,RAMO_FIREBASE_WEB_APP_ID:values.appId,
  RAMO_FIREBASE_WEB_PROJECT_ID:values.projectId,RAMO_FIREBASE_WEB_MESSAGING_SENDER_ID:values.messagingSenderId,
  RAMO_FIREBASE_WEB_VAPID_KEY:values.vapidKey};
for(const script of ['prepare_web_push.mjs','prepare_web_maps.mjs']){
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./'+script,import.meta.url)),'--role='+role],{env,stdio:'inherit'});
  if(result.error||result.status!==0)throw new Error('Não foi possível preparar '+role+'. Use checkout original e configuração completa.');
}
console.log('Configuração pública preparada para '+role+'; provedores ainda exigem homologação.');

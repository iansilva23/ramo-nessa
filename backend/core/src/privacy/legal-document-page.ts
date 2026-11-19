import type { LegalDocumentRecord } from './privacy-repository.js';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** A human-readable rendering of the same versioned document used by the apps. */
export function legalDocumentPage(document: Pick<LegalDocumentRecord,'title'|'content'|'version'|'effectiveAt'> | undefined) {
 const title=document?.title??'Documento ainda não publicado';
 const meta=document?`Versão ${document.version} · Vigência: ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza'}).format(new Date(document.effectiveAt))}`:'';
 const content=document?.content??'O documento ainda está em preparação. Para informações ou pedidos de privacidade, escreva para suporteramonessa@gmail.com.';
 return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Ramo Nessa</title><style>:root{font-family:system-ui,sans-serif;color:#181818;background:#fafafa}body{max-width:800px;margin:40px auto;padding:24px;line-height:1.7}a{color:#343434}header{border-bottom:1px solid #ddd;margin-bottom:24px}article{white-space:pre-wrap;overflow-wrap:anywhere}h1{line-height:1.2}footer{border-top:1px solid #ddd;margin-top:32px;padding-top:16px}@media(max-width:480px){body{margin:0;padding:20px}}</style><header><strong>Ramo Nessa</strong><h1>${escape(title)}</h1><p>${escape(meta)}</p></header><article>${escape(content)}</article><footer>Contato: <a href="mailto:suporteramonessa@gmail.com">suporteramonessa@gmail.com</a><br><a href="/excluir-conta">Solicitar exclusão da conta</a></footer></html>`;
}

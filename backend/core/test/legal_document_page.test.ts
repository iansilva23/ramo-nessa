import assert from 'node:assert/strict';
import test from 'node:test';
import {legalDocumentPage} from '../src/privacy/legal-document-page.js';

test('legal page escapes document content, shows its version and provides account deletion contact',()=>{
 const page=legalDocumentPage({title:'Privacidade <teste>',content:'Primeira linha\n<script>alert("bad")</script>',version:2,effectiveAt:'2026-11-06T12:00:00Z'});
 assert.ok(page.includes('Versão 2'));assert.ok(page.includes('06/11/2026'));
 assert.ok(!page.includes('<script>'));assert.ok(page.includes('&lt;script&gt;'));
 assert.ok(page.includes('suporteramonessa@gmail.com'));assert.ok(page.includes('href="/excluir-conta"'));
});
test('missing document is clearly labelled unpublished and never presented as an active policy',()=>{
 const page=legalDocumentPage(undefined);
 assert.ok(page.includes('Documento ainda não publicado'));assert.ok(!page.includes('Versão 1'));
});

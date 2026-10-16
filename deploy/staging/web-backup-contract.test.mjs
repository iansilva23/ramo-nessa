import test from 'node:test';
import assert from 'node:assert/strict';
import {completedBackupDirectory,privateRuntimeSources,safeUntrackedPaths} from './web-backup-contract.mjs';
test('completed backup selection never guesses latest or selects incomplete snapshots',()=>{
 assert.equal(completedBackupDirectory(['2026-10-16T01-00-00-000Z','2026-10-16T01-00-01-000Z.incomplete']),'2026-10-16T01-00-00-000Z');
 for(const entries of [[],['2026-10-16T01-00-00-000Z.incomplete'],['2026-10-16T01-00-00-000Z','2026-10-16T01-00-01-000Z']])assert.throws(()=>completedBackupDirectory(entries));
});
test('only named runtime file references are backed up, never interpreted as shell',()=>{
 assert.deepEqual(privateRuntimeSources('PUSH_PROVIDER=fcm\nFIREBASE_SERVICE_ACCOUNT_HOST_FILE=/etc/ramo/firebase.json\nUNRELATED=/etc/other\nENTRAR_API_SECRET_HOST_FILE=/etc/ramo/otp.txt'),[{key:'FIREBASE_SERVICE_ACCOUNT_HOST_FILE',path:'/etc/ramo/firebase.json'},{key:'ENTRAR_API_SECRET_HOST_FILE',path:'/etc/ramo/otp.txt'}]);
 for(const raw of ['relative/file','/etc/ramo/../secret','/etc/ramo/$VAR','/etc/ramo/a b'])assert.throws(()=>privateRuntimeSources('FIREBASE_SERVICE_ACCOUNT_HOST_FILE='+raw));
 assert.throws(()=>privateRuntimeSources('FIREBASE_SERVICE_ACCOUNT_HOST_FILE=/a\nFIREBASE_SERVICE_ACCOUNT_HOST_FILE=/b'));
});
test('local untracked file copying rejects traversal and absolute paths',()=>{
 assert.deepEqual(safeUntrackedPaths(['apps/admin/pages/site.html']),['apps/admin/pages/site.html']);
 for(const path of ['/etc/passwd','../secret','apps/../../secret','./file','a\0b'])assert.throws(()=>safeUntrackedPaths([path]));
});

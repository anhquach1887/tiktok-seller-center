import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const temp=mkdtempSync(fileURLToPath(new URL('../.test-data-',import.meta.url)));
process.env.DATA_DIR=temp;process.env.APP_SECRET='unit-test-key-only-not-a-production-secret';
delete process.env.DATABASE_URL;delete process.env.VERCEL;
const store=await import('../lib/store.mjs');
test.after(()=>{store.db().close();rmSync(temp,{recursive:true,force:true})});
test('connection is encrypted and public state never returns cookie',async()=>{
 const token=store.createSession(),session=store.getSession(token),connection={cookie:'sessionid=secret-test-cookie',advertiserId:'1234567890123456',sellerId:'9876543210123456'};
 const encrypted=store.encrypt(connection);assert.ok(!encrypted.includes(connection.cookie));assert.deepEqual(store.decrypt(encrypted),connection);
 store.update(session.id,{connection:encrypted});const state=await store.publicState(store.getSession(token));assert.equal(state.connected,true);assert.ok(!JSON.stringify(state).includes('secret-test-cookie'));
});
test('session data is isolated and leases prevent overlapping work',()=>{
 const a=store.getSession(store.createSession()),b=store.getSession(store.createSession());store.log(a.id,'check','private event');assert.equal(store.logs(b.id).length,0);
 const lease=store.acquire(a.id);assert.throws(()=>store.acquire(a.id));store.release(a.id,'wrong-lease');assert.throws(()=>store.acquire(a.id));store.renew(a.id,lease);store.release(a.id,lease);store.release(a.id,store.acquire(a.id));
});

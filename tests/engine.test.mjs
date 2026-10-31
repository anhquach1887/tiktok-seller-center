import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const temp=mkdtempSync(fileURLToPath(new URL('../.test-data-',import.meta.url)));
process.env.DATA_DIR=temp;process.env.APP_SECRET='engine-test-key-only-not-a-production-secret';
delete process.env.DATABASE_URL;delete process.env.VERCEL;
const store=await import('../lib/store.mjs');
const {locked,pauseSelected,automaticCycle}=await import('../lib/engine.mjs');
const {TikTokApi}=await import('../lib/tiktok.mjs');
const {vietnamDate}=await import('../lib/rules.mjs');
const originalList=TikTokApi.prototype.list,originalPause=TikTokApi.prototype.pause;
test.afterEach(()=>{TikTokApi.prototype.list=originalList;TikTokApi.prototype.pause=originalPause});
test.after(()=>{store.db().close();rmSync(temp,{recursive:true,force:true})});
const row={id:'1880294716548322',name:'Mock campaign',enabled:true,statusKnown:true,roi:4.8,spend:53658};
function setup(){const session=store.getSession(store.createSession());store.update(session.id,{connection:store.encrypt({cookie:'csrftoken=test; sessionid=fake',advertiserId:'7639390141899063304',sellerId:'7494773876655295231'}),snapshot:{planId:'plan-test',date:vietnamDate(),fetchedAt:new Date().toISOString(),rows:[row]}});return store.byId(session.id)}
test('a consumed preview cannot be submitted a second time',async()=>{
 const session=setup();let writes=0;
 TikTokApi.prototype.pause=async()=>{writes++;return {paused:true,...row}};
 TikTokApi.prototype.list=async()=>({date:vietnamDate(),fetchedAt:new Date().toISOString(),rows:[{...row,enabled:false}]});
 await locked(session.id,(s,renew)=>pauseSelected(s,[row.id],'plan-test',renew));
 await assert.rejects(()=>locked(session.id,(s,renew)=>pauseSelected(s,[row.id],'plan-test',renew)),/hết hạn/);
 assert.equal(writes,1);
});
test('a different session cannot pause IDs outside its own preview',async()=>{
 const session=setup();let writes=0;TikTokApi.prototype.pause=async()=>{writes++};
 await assert.rejects(()=>locked(session.id,(s,renew)=>pauseSelected(s,['9999999999999999'],'plan-test',renew)),/ngoài/);assert.equal(writes,0);
});
test('an uncertain write stops automatic mode and invalidates the snapshot',async()=>{
 const session=setup();store.update(session.id,{automatic:1});
 TikTokApi.prototype.pause=async()=>{throw new Error('Uncertain update; inspect TikTok')};
 const result=await locked(session.id,(s,renew)=>pauseSelected(s,[row.id],'plan-test',renew,true));
 assert.ok(result.error);assert.equal(store.byId(session.id).automatic,0);assert.equal(store.byId(session.id).snapshot,null);assert.equal(store.logs(session.id)[0].kind,'error');
});
test('scheduler never runs disabled or future rules',async()=>{
 const session=setup();let calls=0;TikTokApi.prototype.list=async()=>{calls++;throw new Error('must not run')};
 await automaticCycle(session.id);store.update(session.id,{automatic:1,next_run:Date.now()+60000});await automaticCycle(session.id);assert.equal(calls,0);
});
test('a serverless function interrupted mid-write is disarmed before the next run',async()=>{
 const session=setup();store.update(session.id,{automatic:1,next_run:0,pending_write:row.id});let calls=0;
 TikTokApi.prototype.list=async()=>{calls++;throw new Error('must not retry')};
 await automaticCycle(session.id);assert.equal(calls,0);assert.equal(store.byId(session.id).automatic,0);assert.equal(store.byId(session.id).pending_write,row.id);
});
test('time budget exhaustion defers remaining campaigns without sending writes',async()=>{
 const session=setup();store.update(session.id,{automatic:1,next_run:0});let writes=0;
 TikTokApi.prototype.pause=async()=>{writes++};TikTokApi.prototype.list=async()=>({date:vietnamDate(),fetchedAt:new Date().toISOString(),rows:[row]});
 const result=await locked(session.id,(s,renew)=>pauseSelected(s,[row.id],'plan-test',renew,true,Date.now()+1000));
 assert.equal(writes,0);assert.equal(result.remaining,1);assert.equal(store.byId(session.id).automatic,1);
});

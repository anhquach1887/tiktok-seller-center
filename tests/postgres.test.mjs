import test from 'node:test';
import assert from 'node:assert/strict';
import{DatabaseSync}from'node:sqlite';
import{readFileSync}from'node:fs';
// Exercise the async production adapter against a SQL fixture, including leases,
// raw-text Neon responses, and the complete scheduler -> TikTok -> audit flow.
process.env.DATABASE_URL='postgresql://test:fake-password@ep-test.ap-southeast-1.aws.neon.tech/neondb';
process.env.APP_SECRET='test-only-cloud-encryption-key-not-production';
process.env.CRON_SECRET='test-only-cron-key-with-more-than-32-characters';
const fixture=new DatabaseSync(':memory:');
fixture.exec('PRAGMA foreign_keys=ON;'+readFileSync(new URL('../schema.sql',import.meta.url),'utf8').replace('BIGSERIAL PRIMARY KEY','INTEGER PRIMARY KEY AUTOINCREMENT'));
const originalFetch=globalThis.fetch;let sqlCalls=0;
globalThis.fetch=async(endpoint,options)=>{
 assert.equal(String(endpoint),'https://ep-test.ap-southeast-1.aws.neon.tech/sql');sqlCalls++;
 const body=JSON.parse(options.body),params=[];
 const sql=body.query.replace(/\$(\d+)/g,(_,index)=>{params.push(body.params[Number(index)-1]);return'?'});
 const statement=fixture.prepare(sql);
 let rows;
 if(statement.columns().length)rows=statement.all(...params);else{statement.run(...params);rows=[]}
 return{ok:true,json:async()=>({rows:rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value===null?null:String(value)]))),rowCount:rows.length})};
};
const store=await import('../lib/store.mjs');
const{TikTokApi}=await import('../lib/tiktok.mjs');
const{runTick}=await import('../lib/cron.mjs');
const{vietnamDate}=await import('../lib/rules.mjs');
const originalList=TikTokApi.prototype.list,originalPause=TikTokApi.prototype.pause;
test.afterEach(()=>{TikTokApi.prototype.list=originalList;TikTokApi.prototype.pause=originalPause});
test.after(()=>{globalThis.fetch=originalFetch;fixture.close()});
test('production storage roundtrips encrypted credentials and preserves tenant isolation',async()=>{
 const a=await store.getSession(await store.createSession()),b=await store.getSession(await store.createSession());
 assert.ok(a.id!==b.id);assert.equal(a.next_run,0);assert.equal(a.rule.threshold,5);
 const connection={cookie:'csrftoken=fake; sessionid=fake-private',advertiserId:'7639390141899063304',sellerId:'7494773876655295231'};
 await store.update(a.id,{connection:store.encrypt(connection)});await store.log(a.id,'test','private event');
 const state=await store.publicState(await store.byId(a.id));assert.equal(state.connected,true);assert.equal(state.schedulerConfigured,true);assert.ok(!JSON.stringify(state).includes('fake-private'));assert.equal((await store.logs(b.id)).length,0);
 const lease=await store.acquire(a.id);await assert.rejects(()=>store.acquire(a.id));await store.renew(a.id,lease);await store.release(a.id,lease);
 await store.deleteSession(a.id);assert.equal(await store.byId(a.id),null);assert.equal((await store.logs(a.id)).length,0);
});
test('server-side tick works through async Postgres storage without an online browser',async()=>{
 const session=await store.getSession(await store.createSession());let paused=false,writes=0;
 const row={id:'1880294716548322',name:'Cloud test',enabled:true,statusKnown:true,roi:4.8,spend:53658};
 await store.update(session.id,{connection:store.encrypt({cookie:'csrftoken=fake; sessionid=fake',advertiserId:'7639390141899063304',sellerId:'7494773876655295231'}),automatic:1,next_run:0});
 TikTokApi.prototype.list=async()=>({date:vietnamDate(),fetchedAt:new Date().toISOString(),rows:[{...row,enabled:!paused}]});
 TikTokApi.prototype.pause=async()=>{const pending=await store.byId(session.id);assert.equal(pending.pending_write,row.id);paused=true;writes++;return{paused:true,...row}};
 const result=await runTick();assert.equal(result.ok,true);assert.equal(result.checked,1);assert.equal(writes,1);
 const current=await store.byId(session.id);assert.equal(current.pending_write,null);assert.equal(current.automatic,1);assert.ok(current.next_run>Date.now());
 assert.equal((await store.publicState(current)).workerOnline,true);assert.ok((await store.logs(session.id)).some(row=>row.kind==='paused'));
 await runTick();assert.equal(writes,1);assert.ok(sqlCalls>10);
});
test('production rate limit counts attempts atomically and is shared across invocations',async()=>{
 assert.equal(await store.loginAttempts('test-key'),1);assert.equal(await store.loginAttempts('test-key'),2);
});

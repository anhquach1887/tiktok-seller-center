import test from 'node:test';
import assert from 'node:assert/strict';
import {createNeonQuery} from '../lib/neon-http.mjs';
import {authorizedCron} from '../lib/cron.mjs';
const url='postgresql://user:test-password@ep-example-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
test('Neon HTTP transport binds parameters and keeps credentials out of URLs/body',async()=>{
 const query=createNeonQuery(url,async(endpoint,options)=>{
  assert.equal(endpoint,'https://api.ap-southeast-1.aws.neon.tech/sql');
  assert.equal(options.headers['Neon-Connection-String'],url);assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.deepEqual(body,{query:'SELECT $1,$2,$3',params:["x'; DROP TABLE sessions; --",'123',null]});assert.ok(!options.body.includes('test-password'));
  return{ok:true,json:async()=>({rows:[{id:'123'}],rowCount:1})};
 });
 assert.equal((await query('SELECT $1,$2,$3',["x'; DROP TABLE sessions; --",123,null])).rows[0].id,'123');
});
test('Neon errors do not expose connection strings or response contents',async()=>{
 const query=createNeonQuery(url,async()=>({ok:false,status:403,json:async()=>({error:url})}));
 await assert.rejects(()=>query('SELECT 1'),error=>!error.message.includes('test-password')&&error.message.includes('403'));
 const unreachable=createNeonQuery(url,async()=>{throw new Error(url)});await assert.rejects(()=>unreachable('SELECT 1'),error=>!error.message.includes('test-password'));
});
test('database transport rejects arbitrary hosts and missing credentials',()=>{
 for(const value of ['postgresql://user:pass@localhost/db','https://example.com','postgresql://host.neon.tech/db'])assert.throws(()=>createNeonQuery(value));
});
test('current Neon c-3 hosts use the regional API endpoint, with credentials unchanged',async()=>{
 const connection='postgresql://user:fake@ep-example-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
 const query=createNeonQuery(connection,async(endpoint,options)=>{assert.equal(endpoint,'https://api.c-3.ap-southeast-1.aws.neon.tech/sql');assert.equal(options.headers['Neon-Connection-String'],connection);return{ok:true,json:async()=>({rows:[{ok:'1'}]})}});
 assert.equal((await query('SELECT 1 AS ok')).rows[0].ok,'1');
});
test('missing schema and invalid password produce useful errors without leaking server messages',async()=>{
 for(const[code,expected]of[['42P01',/schema.sql/],['28P01',/Mật khẩu/]]){
  const query=createNeonQuery(url,async()=>({ok:false,status:400,json:async()=>({code,message:url})}));
  await assert.rejects(()=>query('SELECT 1'),error=>expected.test(error.message)&&!error.message.includes('test-password'));
 }
});
test('cron endpoint requires an exact bearer token of sufficient length',()=>{
 const secret='a'.repeat(48);assert.equal(authorizedCron(`Bearer ${secret}`,secret),true);
 for(const header of [null,'',secret,`Bearer ${secret}extra`,`Bearer ${'b'.repeat(48)}`])assert.equal(authorizedCron(header,secret),false);
 assert.equal(authorizedCron('Bearer short','short'),false);
});
test('Vercel never silently falls back to ephemeral SQLite',async()=>{
 const previous=process.env.VERCEL,dbUrl=process.env.DATABASE_URL;process.env.VERCEL='1';delete process.env.DATABASE_URL;
 try{const{createSession}=await import('../lib/store.mjs');assert.throws(()=>createSession(),/DATABASE_URL/)}finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;if(dbUrl!==undefined)process.env.DATABASE_URL=dbUrl}
});

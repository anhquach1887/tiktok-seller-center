import{spawn}from'node:child_process';
import{randomBytes}from'node:crypto';
import{mkdtempSync,rmSync}from'node:fs';
import{fileURLToPath}from'node:url';
import{createServer}from'node:net';
import assert from'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=mkdtempSync(fileURLToPath(new URL('../.test-data-',import.meta.url)));
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const origin=`http://127.0.0.1:${port}`,password=randomBytes(16).toString('hex'),cron=randomBytes(32).toString('hex');
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,windowsHide:true,env:{...process.env,NODE_ENV:'production',DATABASE_URL:'',VERCEL:'',VERCEL_ENV:'',DATA_DIR:temp,APP_SECRET:randomBytes(32).toString('hex'),DASHBOARD_PASSWORD:password,APP_ORIGIN:origin,CRON_SECRET:cron},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>{output=(output+chunk).slice(-3000)});child.stderr.on('data',chunk=>{output=(output+chunk).slice(-3000)});
const exited=new Promise(resolve=>child.once('exit',resolve));
let cookie='';
async function post(action,body={},requestOrigin=origin){return fetch(`${origin}/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json','x-roi-request':'1',Origin:requestOrigin,Cookie:cookie},body:JSON.stringify(body)})}
try{
 let ready=false;for(let i=0;i<100;i++){try{const response=await fetch(`${origin}/api/state`);if(response.status===401){ready=true;break}}catch{}if(child.exitCode!==null)throw new Error('Next server exited: '+output);await new Promise(resolve=>setTimeout(resolve,200))}
 assert.equal(ready,true,'Production server did not become ready');
 assert.equal((await post('login',{password},'https://other.example')).status,400);
 assert.equal((await post('login',{password:'wrong'})).status,401);
 const login=await post('login',{password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('roi_session='));
 assert.equal((await(await fetch(`${origin}/api/state`,{headers:{Cookie:cookie}})).json()).connected,false);
 assert.equal((await post('rules',{threshold:4.9,minSpend:100,skipZero:true,intervalMinutes:15})).status,200);
 assert.equal((await fetch(`${origin}/api/cron`)).status,401);
 const tick=await fetch(`${origin}/api/cron`,{headers:{Authorization:`Bearer ${cron}`}});assert.equal(tick.status,200);assert.equal((await tick.json()).checked,0);
 assert.equal((await post('logout')).status,200);
 assert.equal((await fetch(`${origin}/api/state`,{headers:{Cookie:cookie}})).status,401);
 console.log('Production HTTP smoke passed: login, CSRF, session isolation, rules, cron auth, empty offline tick, logout. No TikTok requests sent.');
}finally{child.kill();await exited;rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200})}

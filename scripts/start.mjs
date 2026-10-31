import './env.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.APP_SECRET || process.env.APP_SECRET.length<32 || !process.env.DASHBOARD_PASSWORD || !process.env.APP_ORIGIN) throw new Error('Production requires APP_SECRET (32+ chars), DASHBOARD_PASSWORD, and APP_ORIGIN.');
const env={...process.env,NODE_ENV:'production'};
const web=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','0.0.0.0'],{cwd:root,env,stdio:'inherit'});
const worker=spawn(process.execPath,[path.join(root,'scripts/worker.mjs')],{cwd:root,env,stdio:'inherit'});
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;web.kill();worker.kill();process.exitCode=code;}
web.on('exit',code=>stop(code||0));worker.on('exit',code=>stop(code||0));
web.on('error',error=>{console.error(error.message);stop(1)});worker.on('error',error=>{console.error(error.message);stop(1)});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());

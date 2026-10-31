import {timingSafeEqual,createHash} from 'node:crypto';
import {heartbeat,dueSessions} from './store.mjs';
import {automaticCycle} from './engine.mjs';
export function authorizedCron(header,secret=process.env.CRON_SECRET){
 if(typeof secret!=='string'||secret.length<32||typeof header!=='string')return false;
 const digest=value=>createHash('sha256').update(value).digest();
 return timingSafeEqual(digest(header),digest(`Bearer ${secret}`));
}
export async function runTick({deadline=Date.now()+220000}={}){
 await heartbeat();
 const due=await dueSessions(5);let checked=0,failed=0;
 for(const row of due){
  if(Date.now()>deadline-90000)break;
  try{await automaticCycle(row.id,deadline);checked++}catch{failed++}
 }
 await heartbeat();
 return{ok:failed===0,checked,failed,deferred:due.length-checked-failed,at:new Date().toISOString()};
}

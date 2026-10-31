import * as local from './store-sqlite.mjs';
import * as cloud from './store-postgres.mjs';
export {hash,encrypt,decrypt} from './store-sqlite.mjs';
function backend(){if(process.env.DATABASE_URL)return cloud;if(process.env.VERCEL)throw new Error('Cần DATABASE_URL của Neon trên Vercel. Không dùng SQLite tạm trên serverless.');return local}
export const db=()=>{if(backend()!==local)throw new Error('SQLite chỉ dùng local.');return local.db()};
export const createSession=(...args)=>backend().createSession(...args);
export const getSession=(...args)=>backend().getSession(...args);
export const byId=(...args)=>backend().byId(...args);
export const update=(...args)=>backend().update(...args);
export const acquire=(...args)=>backend().acquire(...args);
export const renew=(...args)=>backend().renew(...args);
export const release=(...args)=>backend().release(...args);
export const log=(...args)=>backend().log(...args);
export const logs=(...args)=>backend().logs(...args);
export async function heartbeat(){if(backend()===cloud)return cloud.heartbeat();local.db().prepare('INSERT INTO runtime_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('worker_heartbeat',String(Date.now()))}
export async function dueSessions(limit=5){if(backend()===cloud)return cloud.dueSessions(limit);return local.db().prepare('SELECT id FROM sessions WHERE automatic=1 AND next_run<=? AND lease_until<? ORDER BY next_run ASC LIMIT ?').all(Date.now(),Date.now(),limit)}
export async function deleteSession(id){if(backend()===cloud)return cloud.deleteSession(id);local.db().prepare('DELETE FROM audit WHERE session_id=?').run(id);local.db().prepare('DELETE FROM sessions WHERE id=?').run(id)}
export async function loginAttempts(key){
 if(backend()===cloud)return cloud.loginAttempts(key);
 const now=Date.now();return local.db().prepare('INSERT INTO login_limits(key,attempts,since) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_limits.since<? THEN 1 ELSE login_limits.attempts+1 END,since=CASE WHEN login_limits.since<? THEN excluded.since ELSE login_limits.since END RETURNING attempts').get(key,now,now-60000,now-60000).attempts;
}
export async function publicState(session){
 let account=null;if(session.connection){const c=local.decrypt(session.connection);account={advertiserId:c.advertiserId,sellerId:c.sellerId}}
 const cloudMode=backend()===cloud;
 const lastTick=cloudMode?await cloud.heartbeatAt():Number(local.db().prepare('SELECT value FROM runtime_meta WHERE key=?').get('worker_heartbeat')?.value||0);
 return {connected:!!account,account,rule:session.rule,snapshot:session.snapshot,automatic:!!session.automatic,nextRun:session.next_run||null,busy:session.lease_until>Date.now(),workerOnline:Date.now()-lastTick<(cloudMode?20*60000:20000),schedulerConfigured:cloudMode?!!process.env.CRON_SECRET:Date.now()-lastTick<20000,schedulerMode:cloudMode?'cloud':'local',lastTick:lastTick||null,minIntervalMinutes:cloudMode?5:1,logs:await logs(session.id)};
}

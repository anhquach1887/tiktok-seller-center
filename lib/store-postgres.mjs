import {randomBytes} from 'node:crypto';
import {DEFAULT_RULE} from './rules.mjs';
import {createNeonQuery} from './neon-http.mjs';
import {hash} from './store-sqlite.mjs';
let sql;
export function query(text,params=[]) {sql ||= createNeonQuery(process.env.DATABASE_URL);return sql(text,params)}
function unpack(row){return row?{...row,created:Number(row.created),automatic:Number(row.automatic),next_run:Number(row.next_run),lease_until:Number(row.lease_until),rule:JSON.parse(row.rule),snapshot:row.snapshot?JSON.parse(row.snapshot):null}:null}
export async function createSession(){const token=randomBytes(32).toString('hex');await query('INSERT INTO sessions(id,created,rule) VALUES($1,$2,$3)',[hash(token),Date.now(),JSON.stringify(DEFAULT_RULE)]);return token}
export async function getSession(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;return byId(hash(token))}
export async function byId(id){return unpack((await query('SELECT * FROM sessions WHERE id=$1',[id])).rows[0])}
export async function update(id,fields){
 const entries=Object.entries(fields),allowed=['connection','rule','snapshot','automatic','next_run','pending_write'];
 if(!entries.length||entries.some(([name])=>!allowed.includes(name)))throw new Error('Invalid storage update');
 await query(`UPDATE sessions SET ${entries.map(([name],i)=>`${name}=$${i+1}`).join(',')} WHERE id=$${entries.length+1}`, [...entries.map(([name,value])=>['rule','snapshot'].includes(name)&&value!==null?JSON.stringify(value):value),id]);
}
export async function acquire(id){const lease=randomBytes(16).toString('hex');const result=await query('UPDATE sessions SET lease=$1,lease_until=$2 WHERE id=$3 AND lease_until<$4 RETURNING id',[lease,Date.now()+360000,id,Date.now()]);if(!result.rows.length)throw new Error('Tài khoản đang được xử lý. Chờ thao tác hiện tại kết thúc.');return lease}
export async function renew(id,lease){const result=await query('UPDATE sessions SET lease_until=$1 WHERE id=$2 AND lease=$3 AND lease_until>$4 RETURNING id',[Date.now()+360000,id,lease,Date.now()]);if(!result.rows.length)throw new Error('Phiên xử lý đã hết hạn. Đã dừng các lệnh tiếp theo.')}
export async function release(id,lease){await query('UPDATE sessions SET lease=NULL,lease_until=0 WHERE id=$1 AND lease=$2',[id,lease])}
export async function log(id,kind,message){await query('INSERT INTO audit(session_id,at,kind,message) VALUES($1,$2,$3,$4)',[id,new Date().toISOString(),kind,message.slice(0,1000)]);await query('DELETE FROM audit WHERE session_id=$1 AND id NOT IN (SELECT id FROM audit WHERE session_id=$1 ORDER BY id DESC LIMIT 100)',[id])}
export async function logs(id){return(await query('SELECT at,kind,message FROM audit WHERE session_id=$1 ORDER BY id DESC LIMIT 100',[id])).rows}
export async function heartbeat(){await query('INSERT INTO runtime_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['worker_heartbeat',Date.now()])}
export async function heartbeatAt(){return Number((await query('SELECT value FROM runtime_meta WHERE key=$1',['worker_heartbeat'])).rows[0]?.value||0)}
export async function dueSessions(limit=5){return(await query('SELECT id FROM sessions WHERE automatic=1 AND next_run<=$1 AND lease_until<$1 ORDER BY next_run ASC LIMIT $2',[Date.now(),limit])).rows}
export async function deleteSession(id){await query('DELETE FROM sessions WHERE id=$1',[id])}
export async function loginAttempts(key){const now=Date.now();const result=await query('INSERT INTO login_limits(key,attempts,since) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_limits.since<$3 THEN 1 ELSE login_limits.attempts+1 END,since=CASE WHEN login_limits.since<$3 THEN $2 ELSE login_limits.since END RETURNING attempts',[key,now,now-60000]);return Number(result.rows[0].attempts)}

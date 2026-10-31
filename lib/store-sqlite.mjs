import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { DEFAULT_RULE } from './rules.mjs';

// Runtime database files are mounted separately and must not be traced into builds.
const root = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), 'data'));
let database, encryptionKey;
export const hash = value => createHash('sha256').update(value).digest('hex');
export function db() {
  if (database) return database;
  mkdirSync(root, { recursive: true });
  database = new DatabaseSync(path.join(root, 'roi-guard.sqlite'));
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created INTEGER NOT NULL, connection TEXT, rule TEXT NOT NULL, snapshot TEXT, automatic INTEGER NOT NULL DEFAULT 0, next_run INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, pending_write TEXT);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS audit_session ON audit(session_id, id);
    CREATE TABLE IF NOT EXISTS login_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, since INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS runtime_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  if (!database.prepare('PRAGMA table_info(sessions)').all().some(column=>column.name==='pending_write')) database.exec('ALTER TABLE sessions ADD COLUMN pending_write TEXT');
  return database;
}
function key() {
  if (encryptionKey) return encryptionKey;
  let secret = process.env.APP_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('Thiếu APP_SECRET trên server.');
  if (!secret) {
    mkdirSync(root, { recursive: true });
    const filename = path.join(root, 'dev-key');
    if (!existsSync(filename)) writeFileSync(filename, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
    secret = readFileSync(filename, 'utf8').trim();
  }
  if (secret.length < 32) throw new Error('APP_SECRET cần ít nhất 32 ký tự.');
  return encryptionKey = createHash('sha256').update(secret).digest();
}
export function encrypt(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(x => x.toString('base64')).join('.');
}
export function decrypt(value) {
  const [iv, tag, bytes] = value.split('.').map(x => Buffer.from(x, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(bytes), cipher.final()]).toString('utf8'));
}
export function createSession() {
  const token = randomBytes(32).toString('hex'), id = hash(token);
  db().prepare('INSERT INTO sessions(id,created,rule) VALUES(?,?,?)').run(id, Date.now(), JSON.stringify(DEFAULT_RULE));
  return token;
}
export function getSession(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const row = db().prepare('SELECT * FROM sessions WHERE id=?').get(hash(token));
  return row ? unpack(row) : null;
}
export function byId(id) { const row = db().prepare('SELECT * FROM sessions WHERE id=?').get(id); return row ? unpack(row) : null; }
function unpack(row) { return { ...row, rule: JSON.parse(row.rule), snapshot: row.snapshot ? JSON.parse(row.snapshot) : null }; }
export function update(id, fields) {
  const allowed = ['connection','rule','snapshot','automatic','next_run','pending_write'];
  const entries = Object.entries(fields);
  if (!entries.length || entries.some(([name]) => !allowed.includes(name))) throw new Error('Invalid storage update');
  db().prepare(`UPDATE sessions SET ${entries.map(([name]) => `${name}=?`).join(',')} WHERE id=?`).run(...entries.map(([name,value]) => ['rule','snapshot'].includes(name) && value !== null ? JSON.stringify(value) : value), id);
}
export function acquire(id) {
  const lease = randomBytes(16).toString('hex');
  const result = db().prepare('UPDATE sessions SET lease=?,lease_until=? WHERE id=? AND lease_until<?').run(lease, Date.now()+360000, id, Date.now());
  if (!result.changes) throw new Error('Tài khoản đang được xử lý. Chờ thao tác hiện tại kết thúc.');
  return lease;
}
export function renew(id, lease) {
  const result = db().prepare('UPDATE sessions SET lease_until=? WHERE id=? AND lease=? AND lease_until>?').run(Date.now()+360000, id, lease, Date.now());
  if (!result.changes) throw new Error('Phiên xử lý đã hết hạn. Đã dừng các lệnh tiếp theo.');
}
export function release(id, lease) { db().prepare('UPDATE sessions SET lease=NULL,lease_until=0 WHERE id=? AND lease=?').run(id,lease); }
export function log(id, kind, message) { db().prepare('INSERT INTO audit(session_id,at,kind,message) VALUES(?,?,?,?)').run(id, new Date().toISOString(), kind, message.slice(0,1000)); }
export function logs(id) { return db().prepare('SELECT at,kind,message FROM audit WHERE session_id=? ORDER BY id DESC LIMIT 100').all(id); }
export function publicState(session) {
  let account = null;
  if (session.connection) { const connection = decrypt(session.connection); account = { advertiserId: connection.advertiserId, sellerId: connection.sellerId }; }
  const heartbeat = Number(db().prepare('SELECT value FROM runtime_meta WHERE key=?').get('worker_heartbeat')?.value || 0);
  return { connected: !!account, account, rule: session.rule, snapshot: session.snapshot, automatic: !!session.automatic, nextRun: session.next_run || null, busy: session.lease_until > Date.now(), workerOnline: Date.now()-heartbeat<20000, logs: logs(session.id) };
}

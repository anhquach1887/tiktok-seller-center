-- Run once in Neon SQL Editor before connecting the deployed website.
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, created BIGINT NOT NULL, connection TEXT, rule TEXT NOT NULL,
 snapshot TEXT, automatic INTEGER NOT NULL DEFAULT 0, next_run BIGINT NOT NULL DEFAULT 0,
 lease TEXT, lease_until BIGINT NOT NULL DEFAULT 0, pending_write TEXT
);
CREATE TABLE IF NOT EXISTS audit (
 id BIGSERIAL PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 at TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_session ON audit(session_id,id);
CREATE TABLE IF NOT EXISTS runtime_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,since BIGINT NOT NULL);

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const configuredPath = process.env.DB_PATH || './data/subnetlab.sqlite';
const dbPath = configuredPath === ':memory:' ? ':memory:' : path.resolve(configuredPath);
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plans (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, family INTEGER NOT NULL CHECK(family IN (4,6)), base TEXT NOT NULL,
 data_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS plans_user_updated ON plans(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS ip_records (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 network_cidr TEXT NOT NULL, family INTEGER NOT NULL CHECK(family IN (4,6)), address TEXT NOT NULL,
 address_int TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
DROP INDEX IF EXISTS ip_active_unique;
CREATE UNIQUE INDEX ip_active_unique ON ip_records(user_id, family, address_int) WHERE status='active';
CREATE INDEX IF NOT EXISTS ip_user_plan ON ip_records(user_id, plan_id, status);
CREATE TABLE IF NOT EXISTS reservations (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 network_cidr TEXT NOT NULL, family INTEGER NOT NULL CHECK(family IN (4,6)), address TEXT NOT NULL,
 address_int TEXT NOT NULL, label TEXT NOT NULL, mac TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
DROP INDEX IF EXISTS reservation_unique;
CREATE UNIQUE INDEX reservation_unique ON reservations(user_id, family, address_int);
CREATE INDEX IF NOT EXISTS reservation_user_plan ON reservations(user_id, plan_id);
CREATE TABLE IF NOT EXISTS practice_questions (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 topic TEXT NOT NULL, difficulty TEXT NOT NULL, prompt TEXT NOT NULL, answer TEXT NOT NULL,
 explanation TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attempts (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 question_id TEXT NOT NULL, topic TEXT NOT NULL, difficulty TEXT NOT NULL,
 correct INTEGER NOT NULL CHECK(correct IN (0,1)), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS attempts_user_time ON attempts(user_id, created_at);
`);

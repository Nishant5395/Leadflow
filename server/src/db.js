import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const MIGRATIONS = [

  `
  CREATE TABLE leads (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    company       TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'New'
                  CHECK (status IN ('New','Contacted','Qualified','Proposal Sent','Won','Lost')),
    follow_up_at  TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE discussions (
    id            TEXT PRIMARY KEY,
    lead_id       TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    note          TEXT NOT NULL,
    follow_up_at  TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX idx_leads_status ON leads(status);
  CREATE INDEX idx_leads_follow_up ON leads(follow_up_at);
  CREATE INDEX idx_discussions_lead ON discussions(lead_id, created_at);
  `,
];

export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

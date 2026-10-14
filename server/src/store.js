import { randomUUID } from 'node:crypto';
import { openDatabase } from './db.js';

export const STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost'];
export const SORTS = ['activity', 'followup', 'newest', 'name'];

const ORDER_BY = {
  activity: 'COALESCE(last_discussion_at, created_at) DESC, rid DESC',
  followup: '(follow_up_at IS NULL) ASC, follow_up_at ASC, rid DESC',
  newest: 'created_at DESC, rid DESC',
  name: 'name COLLATE NOCASE ASC, rid ASC',
};

const SUMMARY_SQL = `
  SELECT
    l.rowid AS rid, l.id, l.name, l.company, l.phone, l.status, l.follow_up_at, l.created_at,
    (SELECT d.note       FROM discussions d WHERE d.lead_id = l.id ORDER BY d.created_at DESC, d.rowid DESC LIMIT 1) AS last_note,
    (SELECT d.created_at FROM discussions d WHERE d.lead_id = l.id ORDER BY d.created_at DESC, d.rowid DESC LIMIT 1) AS last_discussion_at,
    (SELECT COUNT(*)     FROM discussions d WHERE d.lead_id = l.id) AS discussion_count
  FROM leads l
`;

const toLead = (r) => ({
  id: r.id,
  name: r.name,
  company: r.company,
  phone: r.phone,
  status: r.status,
  followUpAt: r.follow_up_at,
  createdAt: r.created_at,
  lastNote: r.last_note ?? null,
  lastDiscussionAt: r.last_discussion_at ?? null,
  discussionCount: r.discussion_count,
});

const toDiscussion = (r) => ({ id: r.id, note: r.note, followUpAt: r.follow_up_at, createdAt: r.created_at });

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class Store {
  /**
   * @param {string} file  SQLite file path, or ':memory:'
   * @param {{ seed?: (() => object[]) | object[] }} [options]  demo data, inserted only into an empty database
   */
  constructor(file, { seed } = {}) {
    this.db = openDatabase(file);
    if (seed && this.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n === 0) {
      this.#seed(typeof seed === 'function' ? seed() : seed);
    }
  }

  close() {
    this.db.close();
  }

  ping() {
    return this.db.prepare('SELECT 1 AS ok').get().ok === 1;
  }

  list({ status, q, sort = 'activity', limit = 500, offset = 0 } = {}) {
    const clauses = [];
    const params = [];
    if (status && status !== 'All') {
      clauses.push('status = ?');
      params.push(status);
    }
    if (q) {
      const like = `%${escapeLike(q)}%`;
      clauses.push("(name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')");
      params.push(like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = ORDER_BY[sort] ?? ORDER_BY.activity;

    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM (${SUMMARY_SQL}) ${where}`).get(...params).n;
    const rows = this.db
      .prepare(`SELECT * FROM (${SUMMARY_SQL}) ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    return { items: rows.map(toLead), total, limit, offset };
  }

  get(id) {
    const row = this.db.prepare(`SELECT * FROM (${SUMMARY_SQL}) WHERE id = ?`).get(id);
    if (!row) return null;
    const discussions = this.db
      .prepare('SELECT * FROM discussions WHERE lead_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(id)
      .map(toDiscussion);
    return { ...toLead(row), discussions };
  }

  create({ name, company = '', phone = '' }) {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO leads (id, name, company, phone, status, follow_up_at, created_at)
         VALUES (?, ?, ?, ?, 'New', NULL, ?)`,
      )
      .run(id, name, company, phone, new Date().toISOString());
    return this.get(id);
  }

  setStatus(id, status) {
    const info = this.db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, id);
    return info.changes ? this.get(id) : null;
  }

  addDiscussion(id, { note, followUpAt = null }) {
    const tx = this.db.transaction(() => {
      if (!this.db.prepare('SELECT 1 FROM leads WHERE id = ?').get(id)) return false;
      this.db
        .prepare('INSERT INTO discussions (id, lead_id, note, follow_up_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), id, note, followUpAt, new Date().toISOString());
      if (followUpAt) this.db.prepare('UPDATE leads SET follow_up_at = ? WHERE id = ?').run(followUpAt, id);
      return true;
    });
    return tx() ? this.get(id) : null;
  }

  clearFollowUp(id) {
    const info = this.db.prepare('UPDATE leads SET follow_up_at = NULL WHERE id = ?').run(id);
    return info.changes ? this.get(id) : null;
  }

  #seed(leads) {
    const insertLead = this.db.prepare(
      'INSERT INTO leads (id, name, company, phone, status, follow_up_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertNote = this.db.prepare(
      'INSERT INTO discussions (id, lead_id, note, follow_up_at, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    this.db.transaction(() => {
      for (const l of leads) {
        insertLead.run(l.id, l.name, l.company, l.phone, l.status, l.followUpAt, l.createdAt);
        for (const d of l.discussions) insertNote.run(d.id, l.id, d.note, d.followUpAt, d.createdAt);
      }
    })();
  }
}

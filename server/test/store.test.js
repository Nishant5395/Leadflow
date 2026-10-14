import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { openDatabase, migrate } from '../src/db.js';
import { demoLeads } from '../src/seed.js';
import { tmpDbFile } from '../testing/helpers.js';

const fresh = (seed = false) => new Store(':memory:', { seed: seed ? demoLeads : undefined });
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const HOUR = 3600e3;

test('migrations: schema version is set once and re-running is a no-op', () => {
  const db = openDatabase(':memory:');
  assert.equal(db.pragma('user_version', { simple: true }), 1);
  migrate(db);
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 1);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
});

test('seed data only loads into an empty database, and data survives a restart', () => {
  const file = tmpDbFile();
  const first = new Store(file, { seed: demoLeads });
  const n = first.list().total;
  assert.ok(n >= 6);
  first.create({ name: 'Added after seeding' });
  first.close();

  const second = new Store(file, { seed: demoLeads });
  assert.equal(second.list().total, n + 1, 'no duplicate demo rows, and the new lead is still there');
  assert.equal(second.list({ q: 'Added after seeding' }).total, 1);
  second.close();
});

test('new lead defaults to status New with no follow-up', () => {
  const s = fresh();
  const lead = s.create({ name: 'Ada' });
  assert.equal(lead.status, 'New');
  assert.equal(lead.followUpAt, null);
  assert.equal(lead.discussionCount, 0);
  assert.deepEqual(lead.discussions, []);
});

test('discussions come back newest first, even when created in the same millisecond', () => {
  const s = fresh();
  const { id } = s.create({ name: 'Ada' });
  for (const n of ['one', 'two', 'three']) s.addDiscussion(id, { note: n });
  assert.deepEqual(s.get(id).discussions.map((d) => d.note), ['three', 'two', 'one']);
  assert.equal(s.get(id).lastNote, 'three');
  assert.equal(s.get(id).discussionCount, 3);
});

test('a note with a follow-up sets it; a later note without one keeps it; clear removes it', () => {
  const s = fresh();
  const { id } = s.create({ name: 'Ada' });
  const when = iso(2 * HOUR);
  s.addDiscussion(id, { note: 'call', followUpAt: when });
  s.addDiscussion(id, { note: 'plain note' });
  assert.equal(s.get(id).followUpAt, when);
  s.clearFollowUp(id);
  assert.equal(s.get(id).followUpAt, null);
});

test('missing leads return null instead of throwing', () => {
  const s = fresh();
  assert.equal(s.get('nope'), null);
  assert.equal(s.setStatus('nope', 'Won'), null);
  assert.equal(s.addDiscussion('nope', { note: 'x' }), null);
  assert.equal(s.clearFollowUp('nope'), null);
});

test('database constraints back up the app: foreign keys and valid statuses', () => {
  const s = fresh();
  const { id } = s.create({ name: 'Ada' });
  assert.throws(() =>
    s.db.prepare('INSERT INTO discussions (id, lead_id, note, created_at) VALUES (?,?,?,?)').run('d', 'nope', 'x', iso(0)),
  );
  assert.throws(() => s.db.prepare('UPDATE leads SET status = ? WHERE id = ?').run('Bogus', id));
});

test('addDiscussion is atomic: a failed insert does not leave a half-updated follow-up', () => {
  const s = fresh();
  const { id } = s.create({ name: 'Ada' });
  const original = s.db.prepare.bind(s.db);
  s.db.prepare = (sql) => {
    if (sql.startsWith('UPDATE leads SET follow_up_at')) throw new Error('disk full');
    return original(sql);
  };
  assert.throws(() => s.addDiscussion(id, { note: 'x', followUpAt: iso(HOUR) }), /disk full/);
  s.db.prepare = original;
  assert.equal(s.get(id).discussionCount, 0, 'the note insert was rolled back');
  assert.equal(s.get(id).followUpAt, null);
});

test('pagination: pages are disjoint, cover the whole set, and report the total', () => {
  const s = fresh(true);
  const total = s.list().total;
  const pages = [0, 3, 6].map((offset) => s.list({ limit: 3, offset }));
  const ids = pages.flatMap((p) => p.items.map((l) => l.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, Math.min(9, total));
  assert.ok(pages.every((p) => p.total === total));
});

test('sorting: name is case-insensitive A-Z; followup puts leads without a date last; activity uses the latest note', () => {
  const s = fresh();
  s.create({ name: 'bravo' });
  s.create({ name: 'Alpha' });
  const withDate = s.create({ name: 'Charlie' });
  s.addDiscussion(withDate.id, { note: 'x', followUpAt: iso(HOUR) });

  assert.deepEqual(s.list({ sort: 'name' }).items.map((l) => l.name), ['Alpha', 'bravo', 'Charlie']);
  assert.equal(s.list({ sort: 'followup' }).items[0].name, 'Charlie');
  assert.equal(s.list({ sort: 'activity' }).items[0].name, 'Charlie'); 
  assert.equal(s.list({ sort: 'newest' }).items[0].name, 'Charlie');
});

test('filter by status', () => {
  const s = fresh(true);
  const won = s.list({ status: 'Won' });
  assert.ok(won.total >= 1 && won.items.every((l) => l.status === 'Won'));
  assert.equal(s.list({ status: 'All' }).total, s.list().total);
});

test('search matches name/company/phone and treats % and _ literally', () => {
  const s = fresh();
  s.create({ name: 'Ada', company: '100% Pure', phone: '555-1' });
  s.create({ name: 'Bob', company: 'Other', phone: '555-2' });
  assert.equal(s.list({ q: 'pure' }).total, 1);
  assert.equal(s.list({ q: '555' }).total, 2);
  assert.equal(s.list({ q: '%' }).total, 1);
  assert.equal(s.list({ q: '_' }).total, 0);
});

test('SQL injection attempts are inert', () => {
  const s = fresh(true);
  const before = s.list().total;
  assert.equal(s.list({ q: "'; DROP TABLE leads; --" }).total, 0);
  assert.equal(s.list().total, before);
});

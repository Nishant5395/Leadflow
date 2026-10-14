import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from '../testing/helpers.js';

const HOUR = 3600e3;
const iso = (off) => new Date(Date.now() + off).toISOString();

test('full lead lifecycle through the HTTP API', async () => {
  const app = await startTestApp();
  try {
    const created = await app.call('POST', '/api/leads', { name: '  Ada Lovelace  ', company: 'Analytical', phone: '1' });
    assert.equal(created.status, 201);
    assert.equal(created.body.name, 'Ada Lovelace'); // trimmed
    assert.equal(created.body.status, 'New');
    const id = created.body.id;

    const when = iso(2 * HOUR);
    const d = await app.call('POST', `/api/leads/${id}/discussions`, { note: 'Called her.', followUpAt: when });
    assert.equal(d.status, 201);
    assert.equal(d.body.followUpAt, when);
    assert.equal(d.body.lastNote, 'Called her.');

    await app.call('POST', `/api/leads/${id}/discussions`, { note: 'Second note' });
    const detail = await app.call('GET', `/api/leads/${id}`);
    assert.deepEqual(detail.body.discussions.map((x) => x.note), ['Second note', 'Called her.']);
    assert.equal(detail.body.followUpAt, when); // a later note without a follow-up does not erase it

    assert.equal((await app.call('PATCH', `/api/leads/${id}`, { status: 'Qualified' })).body.status, 'Qualified');
    assert.equal((await app.call('DELETE', `/api/leads/${id}/follow-up`)).body.followUpAt, null);
  } finally {
    await app.close();
  }
});

test('a follow-up given in any timezone offset is stored as UTC', async () => {
  const app = await startTestApp({ seed: false });
  try {
    const { id } = (await app.call('POST', '/api/leads', { name: 'Ada' })).body;
    const r = await app.call('POST', `/api/leads/${id}/discussions`, { note: 'x', followUpAt: '2026-10-14T10:00:00+05:30' });
    assert.equal(r.body.followUpAt, '2026-10-14T04:30:00.000Z');
  } finally {
    await app.close();
  }
});

test('validation returns 400 with field-level details', async () => {
  const app = await startTestApp();
  try {
    const noName = await app.call('POST', '/api/leads', { company: 'X' });
    assert.equal(noName.status, 400);
    assert.equal(noName.body.error, 'Name is required');
    assert.equal(noName.body.details[0].field, 'name');

    assert.equal((await app.call('POST', '/api/leads', { name: '   ' })).status, 400);
    assert.equal((await app.call('POST', '/api/leads', { name: 'x'.repeat(121) })).status, 400);
    assert.equal((await app.call('POST', '/api/leads', { name: 5 })).status, 400);

    const id = (await app.call('POST', '/api/leads', { name: 'Ada' })).body.id;
    assert.equal((await app.call('PATCH', `/api/leads/${id}`, { status: 'Bogus' })).status, 400);
    assert.equal((await app.call('POST', `/api/leads/${id}/discussions`, { note: '' })).status, 400);
    assert.equal((await app.call('POST', `/api/leads/${id}/discussions`, { note: 'x', followUpAt: 'nope' })).status, 400);
    assert.equal((await app.call('POST', `/api/leads/${id}/discussions`, { note: 'x'.repeat(4001) })).status, 400);
  } finally {
    await app.close();
  }
});

test('malformed JSON and oversized bodies get clean errors, not stack traces', async () => {
  const app = await startTestApp();
  try {
    const bad = await app.call('POST', '/api/leads', '{not json', { 'content-type': 'application/json' });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /not valid JSON/);
    assert.ok(!bad.text.includes('node_modules') && !bad.text.includes('    at '), 'no stack trace leaked');

    const big = await app.call('POST', '/api/leads', { name: 'x', company: 'y'.repeat(80_000) });
    assert.equal(big.status, 413);
  } finally {
    await app.close();
  }
});

test('404s: unknown lead, unknown API route', async () => {
  const app = await startTestApp();
  try {
    assert.equal((await app.call('GET', '/api/leads/nope')).status, 404);
    assert.equal((await app.call('PATCH', '/api/leads/nope', { status: 'Won' })).status, 404);
    assert.equal((await app.call('POST', '/api/leads/nope/discussions', { note: 'x' })).status, 404);
    assert.equal((await app.call('DELETE', '/api/leads/nope/follow-up')).status, 404);
    const r = await app.call('GET', '/api/does-not-exist');
    assert.equal(r.status, 404);
    assert.ok(r.body.error);
  } finally {
    await app.close();
  }
});

test('list: array body + X-Total-Count; filter, search, sort, paging and query validation', async () => {
  const app = await startTestApp();
  try {
    const all = await app.call('GET', '/api/leads');
    assert.equal(all.status, 200);
    assert.ok(Array.isArray(all.body));
    const total = Number(all.headers.get('x-total-count'));
    assert.equal(all.body.length, total);
    assert.ok(total >= 6);

    const page = await app.call('GET', '/api/leads?limit=2&offset=2');
    assert.equal(page.body.length, 2);
    assert.equal(Number(page.headers.get('x-total-count')), total);
    assert.equal(page.body[0].id, all.body[2].id);

    const won = await app.call('GET', '/api/leads?status=Won');
    assert.ok(won.body.length >= 1 && won.body.every((l) => l.status === 'Won'));

    assert.equal((await app.call('GET', '/api/leads?q=acme')).body.length, 1);

    const names = (await app.call('GET', '/api/leads?sort=name')).body.map((l) => l.name.toLowerCase());
    assert.deepEqual(names, [...names].sort());

    assert.equal((await app.call('GET', '/api/leads?status=Bogus')).status, 400);
    assert.equal((await app.call('GET', '/api/leads?sort=name;DROP')).status, 400);
    assert.equal((await app.call('GET', '/api/leads?limit=1000')).status, 400);
    assert.equal((await app.call('GET', '/api/leads?offset=-1')).status, 400);
    assert.equal((await app.call('GET', '/api/leads?q=a&q=b')).status, 400);
  } finally {
    await app.close();
  }
});

test('list rows carry what the screen needs: last note, its time, follow-up, count', async () => {
  const app = await startTestApp();
  try {
    const sarah = (await app.call('GET', '/api/leads?q=sarah')).body[0];
    assert.equal(sarah.lastNote, 'Sent pricing PDF. Said she would review with her boss.');
    assert.ok(sarah.lastDiscussionAt);
    assert.ok(sarah.followUpAt);
    assert.equal(sarah.discussionCount, 3);
    assert.equal(sarah.discussions, undefined, 'list rows do not carry the full history');
  } finally {
    await app.close();
  }
});

test('security: helmet headers present, X-Powered-By hidden, request id echoed', async () => {
  const app = await startTestApp();
  try {
    const r = await app.call('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp && csp.includes("default-src 'self'"));
    assert.ok(!csp.includes('upgrade-insecure-requests'));
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.ok(r.headers.get('x-request-id'));

    const echoed = await app.call('GET', '/api/health', undefined, { 'x-request-id': 'abc-123' });
    assert.equal(echoed.headers.get('x-request-id'), 'abc-123');
  } finally {
    await app.close();
  }
});

test('rate limiting returns 429 once the budget is spent', async () => {
  const app = await startTestApp({ env: { RATE_LIMIT_MAX: '5' } });
  try {
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await app.call('GET', '/api/statuses')).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429, 429]);
  } finally {
    await app.close();
  }
});

test('without a built UI, "/" explains that this port is API-only instead of a bare 404', async () => {
  const app = await startTestApp(); // staticDir: null
  try {
    const r = await app.call('GET', '/');
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'LeadFlow API');
    assert.match(r.body.ui, /5173/);
    assert.equal((await app.call('GET', '/.well-known/appspecific/com.chrome.devtools.json')).status, 404);
  } finally {
    await app.close();
  }
});

test('serves the built UI with SPA fallback, but never for /api paths', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-static-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>LeadFlow</title>');
  fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');

  const app = await startTestApp({ staticDir: dir });
  try {
    const home = await app.call('GET', '/');
    assert.match(home.text, /LeadFlow/);
    assert.equal(home.headers.get('cache-control'), 'no-cache');
    const deep = await app.call('GET', '/some/client/route');
    assert.match(deep.text, /LeadFlow/);
    const asset = await app.call('GET', '/assets/app-abc123.js');
    assert.match(asset.headers.get('cache-control'), /immutable/);
    const probe = await app.call('GET', '/.well-known/appspecific/com.chrome.devtools.json');
    assert.equal(probe.status, 404, 'browser probes do not get the app shell');
    const api404 = await app.call('GET', '/api/nothing');
    assert.equal(api404.status, 404);
    assert.ok(api404.body.error);
  } finally {
    await app.close();
  }
});
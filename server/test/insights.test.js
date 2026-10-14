import test from 'node:test';
import assert from 'node:assert/strict';
import { createInsightsService, ruleBasedInsights } from '../src/insights.js';
import { silentLogger } from '../src/logger.js';
import { startTestApp } from '../testing/helpers.js';

const day = 24 * 3600 * 1000;
const lead = {
  name: 'Sarah Connor',
  company: 'Acme',
  phone: '555-0199',
  status: 'Proposal Sent',
  discussions: [
    { note: 'Sent pricing PDF.', createdAt: new Date(Date.now() - 2 * day).toISOString() },
    { note: 'Discovery call.', createdAt: new Date(Date.now() - 9 * day).toISOString() },
  ],
};

const okResponse = (obj) => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }),
});

test('rule-based insights use the status playbook', () => {
  const r = ruleBasedInsights(lead);
  assert.equal(r.source, 'rule-based');
  assert.match(r.summary, /Sarah Connor \(Acme\)/);
  assert.match(r.summary, /2 discussions/);
  assert.match(r.summary, /Sent pricing PDF/);
  assert.equal(r.followUpDays, 3);
});

test('without an API key it never calls the network', async () => {
  let called = false;
  const svc = createInsightsService({ apiKey: '', model: 'm', logger: silentLogger, fetchImpl: () => (called = true) });
  assert.equal(svc.aiEnabled, false);
  assert.equal((await svc.generate(lead)).source, 'rule-based');
  assert.equal(called, false);
});

test('AI path: sends notes (not phone), parses JSON, labels source', async () => {
  let sent;
  const svc = createInsightsService({
    apiKey: 'k',
    model: 'test-model',
    logger: silentLogger,
    fetchImpl: async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return okResponse('Here you go: {"summary":"Waiting on boss.","nextStep":"Nudge on pricing.","followUpDays":2}');
    },
  });
  const r = await svc.generate(lead);
  assert.deepEqual(r, { summary: 'Waiting on boss.', nextStep: 'Nudge on pricing.', followUpDays: 2, source: 'ai' });
  assert.equal(sent.init.headers['x-api-key'], 'k');
  assert.equal(sent.body.model, 'test-model');
  assert.match(sent.body.messages[0].content, /Sent pricing PDF/);
  assert.doesNotMatch(JSON.stringify(sent.body), /555-0199/, 'phone number must not be sent to the API');
  assert.match(sent.body.system, /untrusted/);
});

test('AI path falls back on HTTP errors, bad JSON, bad shape and timeouts', async () => {
  const bad = [
    async () => ({ ok: false, status: 529, json: async () => ({}) }),
    async () => okResponse('sorry, I cannot do that'),
    async () => okResponse({ summary: 'ok', nextStep: 'ok', followUpDays: 9999 }),
    async () => {
      throw new Error('network down');
    },
  ];
  for (const fetchImpl of bad) {
    const svc = createInsightsService({ apiKey: 'k', model: 'm', logger: silentLogger, fetchImpl });
    const r = await svc.generate(lead);
    assert.equal(r.source, 'rule-based');
    assert.equal(r.fallback, true);
  }
});

test('insights endpoint: needs a discussion, and is rate limited', async () => {
  const app = await startTestApp({ seed: false, env: { INSIGHTS_RATE_LIMIT_PER_MINUTE: '2' } });
  try {
    const { id } = (await app.call('POST', '/api/leads', { name: 'Empty' })).body;
    const none = await app.call('POST', `/api/leads/${id}/insights`);
    assert.equal(none.status, 400);

    await app.call('POST', `/api/leads/${id}/discussions`, { note: 'Spoke today.' });
    const ok = await app.call('POST', `/api/leads/${id}/insights`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.source, 'rule-based');
    assert.ok(Number.isInteger(ok.body.followUpDays));

    const limited = await app.call('POST', `/api/leads/${id}/insights`);
    assert.equal(limited.status, 429, 'third call within a minute exceeds the limit of 2');
  } finally {
    await app.close();
  }
});

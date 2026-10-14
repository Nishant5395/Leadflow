import { vi } from 'vitest';
export function createFakeApi(initial = []) {
  let leads = structuredClone(initial);
  const calls = [];
  const failures = [];
  let gate = null;
  let seq = 0;

  const summarize = ({ discussions, ...rest }) => {
    const sorted = [...discussions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      ...rest,
      lastNote: sorted[0]?.note ?? null,
      lastDiscussionAt: sorted[0]?.createdAt ?? null,
      discussionCount: discussions.length,
    };
  };
  const detail = (l) => ({
    ...summarize(l),
    discussions: [...l.discussions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function handle(url, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });

    if (gate && method !== 'GET') await gate;

    const idx = failures.findIndex((f) => f.method === method && url.includes(f.match));
    if (idx !== -1) {
      const [f] = failures.splice(idx, 1);
      return json(f.status ?? 500, { error: f.message });
    }

    const m = url.match(/^\/api\/leads(?:\/([^/]+))?(?:\/(discussions|follow-up|insights))?$/);
    if (!m) return json(404, { error: 'Route not found.' });
    const [, id, sub] = m;
    const lead = id ? leads.find((l) => l.id === id) : null;
    if (id && !lead) return json(404, { error: 'Lead not found.' });

    if (!id && method === 'GET') return json(200, leads.map(summarize));
    if (!id && method === 'POST') {
      if (!body.name?.trim()) return json(400, { error: 'Name is required.' });
      const created = {
        id: `new-${++seq}`,
        name: body.name.trim(),
        company: body.company ?? '',
        phone: body.phone ?? '',
        status: 'New',
        followUpAt: null,
        createdAt: new Date().toISOString(),
        discussions: [],
      };
      leads.unshift(created);
      return json(201, detail(created));
    }
    if (id && !sub && method === 'GET') return json(200, detail(lead));
    if (id && !sub && method === 'PATCH') {
      lead.status = body.status;
      return json(200, detail(lead));
    }
    if (sub === 'discussions' && method === 'POST') {
      lead.discussions.push({
        id: `d-${++seq}`,
        note: body.note.trim(),
        followUpAt: body.followUpAt ?? null,
        createdAt: new Date().toISOString(),
      });
      if (body.followUpAt) lead.followUpAt = body.followUpAt;
      return json(201, detail(lead));
    }
    if (sub === 'follow-up' && method === 'DELETE') {
      lead.followUpAt = null;
      return json(200, detail(lead));
    }
    if (sub === 'insights' && method === 'POST') {
      return json(200, {
        summary: `${lead.name} is at "${lead.status}".`,
        nextStep: 'Send a tailored proposal.',
        followUpDays: 3,
        source: 'rule-based',
      });
    }
    return json(405, { error: 'Method not allowed.' });
  }

  const fetchMock = vi.fn((url, init) => handle(url, init));
  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    get: (id) => leads.find((l) => l.id === id),
    all: () => leads,
    failNext(method, match, message = 'Server exploded', status = 500) {
      failures.push({ method, match, message, status });
    },
    pause() {
      gate = new Promise((resolve) => {
        this.resume = () => {
          gate = null;
          resolve();
        };
      });
    },
    resume() {},
  };
}

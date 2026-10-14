import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Store } from '../src/store.js';
import { createApp } from '../src/app.js';
import { silentLogger } from '../src/logger.js';
import { loadConfig } from '../src/config.js';
import { createInsightsService } from '../src/insights.js';
import { demoLeads } from '../src/seed.js';

export function tmpDbFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'leadflow-')), 'test.db');
}
export async function startTestApp({ seed = true, env = {}, insights, file = ':memory:', staticDir = null } = {}) {
  const config = {
    ...loadConfig({ NODE_ENV: 'test', RATE_LIMIT_MAX: '100000', INSIGHTS_RATE_LIMIT_PER_MINUTE: '100000', ...env }),
    staticDir,
  };
  const store = new Store(file, { seed: seed ? demoLeads : undefined });
  const svc = insights ?? createInsightsService({ apiKey: '', model: 'test', logger: silentLogger });
  const app = createApp({ store, config, logger: silentLogger, insights: svc });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, body: json, text, headers: res.headers };
  };

  return {
    base,
    store,
    call,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          store.close();
          resolve();
        });
      }),
  };
}

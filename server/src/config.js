import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const num = (v, fallback) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};

export function loadConfig(env = process.env) {
  return {
    env: env.NODE_ENV || 'development',
    port: num(env.PORT, 4000),
    dbPath: env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'leadflow.db'),
    seedDemoData: env.SEED_DEMO_DATA !== 'false',
    logLevel: env.LOG_LEVEL || 'info',
    trustProxy: num(env.TRUST_PROXY, 0),
    corsOrigin: env.CORS_ORIGIN || '',
    staticDir: env.STATIC_DIR || path.join(__dirname, '..', '..', 'client', 'dist'),
    rateLimit: {
      windowMs: num(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      max: num(env.RATE_LIMIT_MAX, 600),
      insightsPerMinute: num(env.INSIGHTS_RATE_LIMIT_PER_MINUTE, 10),
    },
    ai: {
      apiKey: env.ANTHROPIC_API_KEY || '',
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      timeoutMs: num(env.AI_TIMEOUT_MS, 15000),
    },
  };
}

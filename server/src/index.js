import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { Store } from './store.js';
import { demoLeads } from './seed.js';
import { createInsightsService } from './insights.js';
import { createApp } from './app.js';

const config = loadConfig();
const logger = createLogger(config);

const store = new Store(config.dbPath, { seed: config.seedDemoData ? demoLeads : undefined });
const insights = createInsightsService({
  apiKey: config.ai.apiKey,
  model: config.ai.model,
  timeoutMs: config.ai.timeoutMs,
  logger,
});
const app = createApp({ store, config, logger, insights });

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.env, db: config.dbPath, ai: insights.aiEnabled ? config.ai.model : 'rule-based' },
    `LeadFlow listening on http://localhost:${config.port}`,
  );
});

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

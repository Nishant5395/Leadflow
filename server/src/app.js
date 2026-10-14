import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { STATUSES } from './store.js';
import { AppError, asyncHandler } from './errors.js';
import { createLeadSchema, statusSchema, discussionSchema, listQuerySchema } from './schemas.js';
function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  throw new AppError(400, details[0].message, details);
}

export function createApp({ store, config, logger, insights }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
    }),
  );
  if (config.corsOrigin) {
    app.use(cors({ origin: config.corsOrigin.split(','), exposedHeaders: ['X-Total-Count', 'X-Request-Id'] }));
  }
  app.use(express.json({ limit: '50kb' }));

  const tooMany = (_req, res) => res.status(429).json({ error: 'Too many requests. Please slow down.' });
  const limiter = (windowMs, limit) =>
    rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, handler: tooMany });

  const api = express.Router();
  api.use(limiter(config.rateLimit.windowMs, config.rateLimit.max));

  api.get('/health', (_req, res) => {
    try {
      res.json({ ok: store.ping(), uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  api.get('/statuses', (_req, res) => res.json(STATUSES));
  api.get('/leads', (req, res) => {
    const { items, total } = store.list(parse(listQuerySchema, req.query));
    res.set('X-Total-Count', String(total));
    res.json(items);
  });

  api.post('/leads', (req, res) => {
    res.status(201).json(store.create(parse(createLeadSchema, req.body)));
  });

  api.get('/leads/:id', (req, res) => {
    const lead = store.get(req.params.id);
    if (!lead) throw new AppError(404, 'Lead not found.');
    res.json(lead);
  });

  api.patch('/leads/:id', (req, res) => {
    const { status } = parse(statusSchema, req.body);
    const lead = store.setStatus(req.params.id, status);
    if (!lead) throw new AppError(404, 'Lead not found.');
    res.json(lead);
  });

  api.post('/leads/:id/discussions', (req, res) => {
    const lead = store.addDiscussion(req.params.id, parse(discussionSchema, req.body));
    if (!lead) throw new AppError(404, 'Lead not found.');
    res.status(201).json(lead);
  });

  api.delete('/leads/:id/follow-up', (req, res) => {
    const lead = store.clearFollowUp(req.params.id);
    if (!lead) throw new AppError(404, 'Lead not found.');
    res.json(lead);
  });

  api.post(
    '/leads/:id/insights',
    limiter(60_000, config.rateLimit.insightsPerMinute),
    asyncHandler(async (req, res) => {
      const lead = store.get(req.params.id);
      if (!lead) throw new AppError(404, 'Lead not found.');
      if (lead.discussions.length === 0) throw new AppError(400, 'Log a discussion first, then there is something to summarise.');
      res.json(await insights.generate(lead));
    }),
  );

  api.use((_req, _res, next) => next(new AppError(404, 'Not found.')));
  app.use('/api', api);

  app.use('/.well-known', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  const dist = config.staticDir;
  const hasUi = Boolean(dist) && fs.existsSync(path.join(dist, 'index.html'));
  if (!hasUi) {
    app.get('/', (_req, res) =>
      res.json({
        name: 'LeadFlow API',
        status: 'running',
        ui: 'No built UI here. In development open http://localhost:5173. To serve the UI from this port, run "npm start".',
        health: '/api/health',
      }),
    );
  }
  if (hasUi) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders(res, file) {
          const hashed = file.includes(`${path.sep}assets${path.sep}`);
          res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use((err, req, res, _next) => {
    let status = err.status || 500;
    let message = err.message;
    if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'Request body is not valid JSON.';
    } else if (err.type === 'entity.too.large') {
      status = 413;
      message = 'Request body is too large.';
    } else if (status >= 500) {
      req.log.error({ err }, 'Unhandled error');
      message = 'Something went wrong on our side.';
    }
    res.status(status).json({ error: message, ...(err.details ? { details: err.details } : {}), requestId: req.id });
  });

  return app;
}
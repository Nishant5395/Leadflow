import pino from 'pino';

export function createLogger(config) {
  return pino({
    level: config.env === 'test' ? 'silent' : config.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
  });
}

export const silentLogger = pino({ level: 'silent' });

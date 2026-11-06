const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

/** Redact both named credential fields and known environment secrets. */
export function redact(value: string): string {
  let out = value.replace(
    /((?:api[-_]?key|secret|authorization)["']?\s*[:=]\s*)[^\s,}"']+/gi,
    '$1[REDACTED]',
  );
  for (const key of ['ALGA_API_KEY', 'CONDUIT_S2S_SECRET']) {
    const secret = process.env[key];
    if (secret) out = out.split(secret).join('[REDACTED]');
  }
  return out;
}
function log(level: Level, message: string, context?: unknown): void {
  const configured = process.env.LOG_LEVEL || 'info';
  const threshold = LEVELS[configured as Level] ?? LEVELS.info;
  if (LEVELS[level] < threshold) return;
  let detail = '';
  if (context !== undefined) {
    try {
      detail = JSON.stringify(context, (key, value) =>
        /key|secret|authorization/i.test(key) ? '[REDACTED]' : value,
      );
    } catch {
      detail = '[unserializable context]';
    }
  }
  console.error(
    redact(`${new Date().toISOString()} [${level.toUpperCase()}] ${message} ${detail}`),
  );
}
export const logger = {
  debug: (message: string, context?: unknown) => log('debug', message, context),
  info: (message: string, context?: unknown) => log('info', message, context),
  warn: (message: string, context?: unknown) => log('warn', message, context),
  error: (message: string, context?: unknown) => log('error', message, context),
};

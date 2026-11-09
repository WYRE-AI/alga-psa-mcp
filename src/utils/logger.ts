import { scopedApiKey } from '../credentials.js';
import { redactLogText } from '../redact.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

/**
 * Redacts credential-named fields, token shapes, the env secrets and the
 * per-request gateway API key in scope.
 */
export function redact(value: string): string {
  return redactLogText(value, [
    process.env.ALGA_API_KEY,
    process.env.CONDUIT_S2S_SECRET,
    scopedApiKey(),
  ]);
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
  // stderr only: stdout is the stdio transport.
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
/** An error's class name, safe to log where its message may hold credentials. */
export const errorType = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

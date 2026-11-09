/**
 * Redaction for anything returned to the model or written to logs. Known
 * secrets (the API key in use, the S2S secret) are removed by exact match,
 * raw and JSON-escaped. Log lines additionally get shape-based redaction.
 */
export const REDACTED = '[REDACTED]';

/** Shorter values are too likely to collide with ordinary text. */
const MIN_SECRET_LENGTH = 4;

export function redactSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < MIN_SECRET_LENGTH) continue;
    out = out.split(secret).join(REDACTED);
    const escaped = JSON.stringify(secret).slice(1, -1);
    if (escaped !== secret) out = out.split(escaped).join(REDACTED);
  }
  return out;
}

const LOG_PATTERNS: [RegExp, string][] = [
  [/((?:api[-_]?key|secret|authorization)["']?\s*[:=]\s*)[^\s,}"']+/gi, `$1${REDACTED}`],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED],
];

export function redactLogText(text: string, secrets: readonly (string | undefined)[]): string {
  let out = redactSecrets(text, secrets);
  for (const [pattern, replacement] of LOG_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

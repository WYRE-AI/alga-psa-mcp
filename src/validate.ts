const MAX_SEGMENT = 256;

/** A bad tool argument. Its message is our own text and safe to show the caller. */
export class ToolArgumentError extends Error {}

/**
 * Returns one URL path segment, percent-encoded. Rejects anything that could
 * change which endpoint is hit: non-strings, empty, `.`, `..`, `/` or `\`,
 * percent-encoded separators or dots, and control characters. Schemas already
 * restrict identifiers; this is the last check before a value enters a path,
 * and the built URL is checked again against the expected path (alga-client.ts).
 */
export function pathSegment(value: unknown, key: string): string {
  const bad = () =>
    new ToolArgumentError(
      `Invalid ${key}: use a single ID (1-${MAX_SEGMENT} characters) without ".", "..", "/" or "\\".`,
    );
  if (typeof value !== 'string') throw bad();
  if (
    value.length === 0 ||
    value.length > MAX_SEGMENT ||
    value === '.' ||
    value === '..' ||
    /[/\\]/.test(value) ||
    /%(2f|5c|2e)/i.test(value) ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw bad();
  return encodeURIComponent(value);
}

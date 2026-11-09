// TODO: This REST client may be replaced with @wyre-ai/node-alga-psa. If so, keep ssrf.ts:
// call validateInstanceUrl on every request, and inject a fetch bound to createInstanceAgent()
// (the connect-time DNS check) through the library's `fetch` option. The library only checks
// URL syntax, so without both it would lose the SSRF and DNS-rebinding protection.
import { setTimeout as delay } from 'node:timers/promises';
import { fetch as undiciFetch } from 'undici';
import type { AlgaCredentials } from './credentials.js';
import { createInstanceAgent, validateInstanceUrl } from './ssrf.js';

export {
  getCredentials,
  runWithCredentials,
  setGatewayMode,
  type AlgaCredentials,
} from './credentials.js';

export class AlgaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Alga's machine-readable error code (e.g. NOT_FOUND), only when it is a plain token. */
    readonly code?: string,
    /** The x-request-id response header, only when it is a plain token. */
    readonly requestId?: string,
  ) {
    super(message);
  }
}
export class AlgaAuthError extends AlgaApiError {}
export class AlgaForbiddenError extends AlgaApiError {}
export class AlgaRateLimitError extends AlgaApiError {}
/** Diagnostics we may repeat from an Alga error. Its free text (message, details) never is. */
export interface VendorErrorInfo {
  code?: string;
  requestId?: string;
}
export function apiFailure(status: number, info: VendorErrorInfo = {}): AlgaApiError {
  const messages: Record<number, string> = {
    400: 'Alga rejected the request. Check the IDs and field values and try again',
    401: 'Alga rejected the API key. Check the API key in the connection settings, or create a new one in Alga under Profile → API Keys',
    403: "The Alga user this API key belongs to doesn't have permission for this action. Ask an Alga admin to add it to that user's role",
    404: "Record not found, or the API key's user can't see it. Check the ID",
    409: "The record changed or is in a state that doesn't allow this. Get the record again and retry",
    422: 'Alga rejected one or more field values. Check required fields and formats and try again',
    429: 'Alga is rate limiting requests. Wait a minute and try again.',
  };
  const message = `${messages[status] || (status >= 300 && status < 400 ? 'Alga redirected the request, which is not allowed. Check that the instance URL is the exact https:// address you use to sign in, with no path' : status >= 500 ? 'Alga is having a server problem. Try again shortly; if it keeps failing, contact Alga support.' : 'Alga API request failed. Check the connection settings and try again.')} (HTTP ${status}).`;
  const diagnostics =
    (info.code ? ` Alga error code: ${info.code}.` : '') +
    (info.requestId ? ` Request ID: ${info.requestId}.` : '');
  const Kind =
    status === 401
      ? AlgaAuthError
      : status === 403
        ? AlgaForbiddenError
        : status === 429
          ? AlgaRateLimitError
          : AlgaApiError;
  return new Kind(message + diagnostics, status, info.code, info.requestId);
}
/** Longest single wait between retries; a longer Retry-After is not worth holding a call for. */
export const MAX_RETRY_WAIT_MS = 5_000;
/** Wall time for one tool call, across every attempt and wait. */
export const REQUEST_DEADLINE_MS = 30_000;
export function retryAfterMs(value: string | null, attempt = 0, now = Date.now()): number {
  let ms = 1000 * 2 ** attempt;
  if (value && /^\d+(\.\d+)?$/.test(value.trim())) ms = Number(value) * 1000;
  else if (value && Number.isFinite(Date.parse(value))) ms = Math.max(0, Date.parse(value) - now);
  return Math.min(MAX_RETRY_WAIT_MS, Math.max(0, ms));
}
/** Page is passed through as given (Alga has no page maximum); it is only floored at 1. */
export const clampPage = (value: unknown) =>
  Math.max(1, typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 1);
/** Alga caps limit at 100 (ApiBaseController.list). */
export const clampLimit = (value: unknown) =>
  Math.min(
    100,
    Math.max(1, typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 25),
  );
/** Largest upstream body we will buffer; the 100 KB output cap only applies afterwards. */
export const MAX_UPSTREAM_RESPONSE_BYTES = 4 * 1024 * 1024;
/** Error bodies are read only for their code, so a much smaller bound applies. */
const MAX_ERROR_BODY_BYTES = 64 * 1024;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
export type QueryValue = string | number | boolean | undefined;

const invalidPath = () =>
  new AlgaApiError('Invalid API path. Check the tool path before retrying.');

/**
 * Builds `{origin}/api/v1{path}` and refuses anything that would not land on
 * exactly that origin and path. Every dynamic segment of `path` must already
 * be validated and percent-encoded (validate.ts). Query values are scalars
 * only: Alga keeps one value per query key, so an array is refused instead of
 * being sent as repeated or bracket keys.
 */
export function buildAlgaUrl(base: URL, path: string, query: Record<string, QueryValue> = {}): URL {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[?#\\]/.test(path) ||
    /(^|\/)(\.|%2e){1,2}(\/|$)/i.test(path)
  )
    throw invalidPath();
  const expected = `/api/v1${path}`;
  const url = new URL(expected, base.origin);
  if (url.origin !== base.origin || url.pathname !== expected) throw invalidPath();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (value === null || typeof value === 'object')
      throw new AlgaApiError(
        `Invalid value for ${key}: Alga accepts one value per query parameter.`,
      );
    url.searchParams.set(
      key,
      String(key === 'page' ? clampPage(value) : key === 'limit' ? clampLimit(value) : value),
    );
  }
  return url;
}

export interface ClientOptions {
  /** Deadline for the whole call, retries included. Defaults to REQUEST_DEADLINE_MS. */
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetch?: typeof undiciFetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** The MCP request's cancellation signal; aborting it stops the call. */
  signal?: AbortSignal;
}
/**
 * One read-only GET to Alga. This client cannot send a body or any other
 * method. A single deadline covers every attempt and wait, and the caller's
 * signal cancels the call, so a slow or hostile upstream cannot hold a socket
 * past the tool call.
 */
export async function requestAlga(
  creds: AlgaCredentials,
  path: string,
  query: Record<string, QueryValue> = {},
  options: ClientOptions = {},
): Promise<unknown> {
  const tenantId = validateTenantId(creds.tenantId);
  const base = await validateInstanceUrl(creds.instanceUrl);
  const url = buildAlgaUrl(base, path, query);
  const headers: Record<string, string> = { 'x-api-key': creds.apiKey, accept: 'application/json' };
  if (tenantId) headers['x-tenant-id'] = tenantId;
  const timeoutMs = options.timeoutMs ?? REQUEST_DEADLINE_MS;
  const deadline = Date.now() + timeoutMs;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const sleep =
    options.sleep ?? ((ms: number, s: AbortSignal) => delay(ms, undefined, { signal: s }));
  const agent = createInstanceAgent();
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await (options.fetch ?? undiciFetch)(url.toString(), {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal,
        dispatcher: agent,
      });
      const wait = retryAfterMs(response.headers.get('retry-after'), attempt);
      if (
        [429, 502, 503, 504].includes(response.status) &&
        attempt < 3 &&
        Date.now() + wait < deadline
      ) {
        await response.body?.cancel();
        await sleep(wait, signal);
        continue;
      }
      if (!response.ok) throw apiFailure(response.status, await errorInfo(response));
      if (response.status === 204) return { data: null };
      const text = await readCapped(response, options.maxResponseBytes);
      if (!text) return { data: null };
      try {
        return JSON.parse(text);
      } catch {
        throw new AlgaApiError('Alga returned an invalid JSON response. Try again shortly.');
      }
    }
  } catch (error) {
    if (error instanceof AlgaApiError) throw error;
    // Vendor bodies and network exceptions can contain credentials; never forward them.
    throw new AlgaApiError('The request to Alga timed out or failed. Try again shortly.');
  } finally {
    await agent.close();
  }
}

/**
 * Reads only Alga's error code (`{error: {code}}`) and the x-request-id header
 * from a failed response. Both must be plain tokens; the vendor's free-text
 * message and details are never read into an error.
 */
async function errorInfo(
  response: Awaited<ReturnType<typeof undiciFetch>>,
): Promise<VendorErrorInfo> {
  const header = response.headers.get('x-request-id');
  const requestId = header && REQUEST_ID.test(header) ? header : undefined;
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    return { requestId };
  }
  let code: unknown;
  try {
    const text = await readCapped(response, MAX_ERROR_BODY_BYTES);
    code = (JSON.parse(text) as { error?: { code?: unknown } } | null)?.error?.code;
  } catch {
    // An unreadable, oversized or non-JSON error body simply has no code.
  }
  return { requestId, code: typeof code === 'string' && ERROR_CODE.test(code) ? code : undefined };
}

async function readCapped(
  response: Awaited<ReturnType<typeof undiciFetch>>,
  cap = MAX_UPSTREAM_RESPONSE_BYTES,
): Promise<string> {
  const tooLarge = () =>
    new AlgaApiError(
      'Alga sent a response larger than 4 MiB, so it was not read. Narrow the request with filters, fields or a smaller limit and try again.',
    );
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
}

export function validateTenantId(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AlgaApiError(
      'Invalid tenant ID. Leave it blank unless Alga support asks you to set it; then enter the UUID they provide.',
    );
  }
  return value;
}

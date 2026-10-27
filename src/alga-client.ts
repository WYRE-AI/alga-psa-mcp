// TODO: Replace this REST client with @wyre-ai/node-alga-psa after its first publish.
import { AsyncLocalStorage } from 'node:async_hooks';
import { fetch as undiciFetch } from 'undici';
import { createInstanceAgent, validateInstanceUrl } from './ssrf.js';

export interface AlgaCredentials {
  instanceUrl: string;
  apiKey: string;
  tenantId?: string;
}
const credentials = new AsyncLocalStorage<AlgaCredentials>();
export const runWithCredentials = <T>(value: AlgaCredentials, fn: () => T): T =>
  credentials.run(value, fn);
export function getCredentials(): AlgaCredentials | null {
  const scoped = credentials.getStore();
  if (scoped) return scoped;
  if (process.env.AUTH_MODE === 'gateway') return null;
  const {
    ALGA_INSTANCE_URL: instanceUrl,
    ALGA_API_KEY: apiKey,
    ALGA_TENANT_ID: tenantId,
  } = process.env;
  return instanceUrl && apiKey ? { instanceUrl, apiKey, tenantId } : null;
}
export class AlgaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
export class AlgaAuthError extends AlgaApiError {}
export class AlgaForbiddenError extends AlgaApiError {}
export class AlgaRateLimitError extends AlgaApiError {}
export function apiFailure(status: number, method: string = 'GET'): AlgaApiError {
  const messages: Record<number, string> = {
    400: 'Alga rejected the request. Check the IDs and field values and try again',
    401: 'Alga rejected the API key. Check the API key in the connection settings, or create a new one in Alga under Profile → API Keys',
    403: "The Alga user this API key belongs to doesn't have permission for this action. Ask an Alga admin to add it to that user's role",
    404: "Record not found, or the API key's user can't see it. Check the ID",
    409: "The record changed or is in a state that doesn't allow this. Get the record again and retry",
    422: 'Alga rejected one or more field values. Check required fields and formats and try again',
    429: 'Alga is rate limiting requests. Wait a minute and try again.',
  };
  const message =
    method.toUpperCase() !== 'GET' && status >= 500
      ? `Alga did not confirm the change (HTTP ${status}). It may already have been saved; check in Alga before retrying.`
      : `${messages[status] || (status >= 300 && status < 400 ? 'Alga redirected the request, which is not allowed. Check that the instance URL is the exact https:// address you use to sign in, with no path' : status >= 500 ? 'Alga is having a server problem. Try again shortly; if it keeps failing, contact Alga support.' : 'Alga API request failed. Check the connection settings and try again.')} (HTTP ${status}).`;
  const Kind =
    status === 401
      ? AlgaAuthError
      : status === 403
        ? AlgaForbiddenError
        : status === 429
          ? AlgaRateLimitError
          : AlgaApiError;
  return new Kind(message, status);
}
export function retryAfterMs(value: string | null, attempt = 0, now = Date.now()): number {
  let ms = 1000 * 2 ** attempt;
  if (value && /^\d+(\.\d+)?$/.test(value.trim())) ms = Number(value) * 1000;
  else if (value && Number.isFinite(Date.parse(value))) ms = Math.max(0, Date.parse(value) - now);
  return Math.min(60_000, Math.max(0, ms));
}
export const clampPage = (value: unknown) =>
  Math.min(
    100,
    Math.max(1, typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 1),
  );
export const clampLimit = (value: unknown) =>
  Math.min(
    100,
    Math.max(1, typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 25),
  );
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
export interface ClientOptions {
  timeoutMs?: number;
  fetch?: typeof undiciFetch;
  sleep?: (ms: number) => Promise<void>;
}
export async function requestAlga(
  creds: AlgaCredentials,
  method: Method,
  path: string,
  query: Record<string, unknown> = {},
  body?: unknown,
  options: ClientOptions = {},
): Promise<unknown> {
  const tenantId = validateTenantId(creds.tenantId);
  const base = await validateInstanceUrl(creds.instanceUrl);
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path))
    throw new AlgaApiError('Invalid API path. Check the tool path before retrying.');
  const url = new URL(`${base.origin}/api/v1${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined)
      url.searchParams.set(
        key,
        String(key === 'page' ? clampPage(value) : key === 'limit' ? clampLimit(value) : value),
      );
  }
  const headers: Record<string, string> = { 'x-api-key': creds.apiKey, accept: 'application/json' };
  if (tenantId) headers['x-tenant-id'] = tenantId;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const agent = createInstanceAgent();
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await (options.fetch ?? undiciFetch)(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        dispatcher: agent,
      });
      const retry =
        response.status === 429 || (method !== 'POST' && [502, 503, 504].includes(response.status));
      if (retry && attempt < 3) {
        await response.body?.cancel();
        await (options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
          retryAfterMs(response.headers.get('retry-after'), attempt),
        );
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw apiFailure(response.status, method);
      }
      if (response.status === 204) return { data: null };
      const text = await response.text();
      if (!text) return { data: null };
      try {
        return JSON.parse(text);
      } catch {
        throw new AlgaApiError(
          'Alga returned an invalid JSON response. Check in Alga before retrying a change; try reads again shortly.',
        );
      }
    }
  } catch (error) {
    if (error instanceof AlgaApiError) throw error;
    // Vendor bodies and network exceptions can contain credentials; never forward them.
    throw new AlgaApiError(
      method === 'GET'
        ? 'The request to Alga timed out or failed. Try again shortly.'
        : 'The request to Alga timed out or failed. The change may already have been saved; check in Alga before retrying.',
    );
  } finally {
    await agent.close();
  }
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

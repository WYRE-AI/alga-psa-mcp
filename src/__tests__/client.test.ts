import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
import {
  requestAlga,
  retryAfterMs,
  clampPage,
  clampLimit,
  getCredentials,
  runWithCredentials,
  setGatewayMode,
  MAX_UPSTREAM_RESPONSE_BYTES,
  AlgaApiError,
  AlgaAuthError,
  AlgaForbiddenError,
  AlgaRateLimitError,
} from '../alga-client.js';
import { dispatchToolCall } from '../tools/index.js';
import { renderResponse, MAX_RESPONSE_BYTES } from '../executor.js';
import { logger } from '../utils/logger.js';
import { json, KEY } from './helpers.js';
const creds = {
  apiKey: KEY,
  instanceUrl: 'https://psa.example.com',
  tenantId: '12345678-1234-1234-1234-123456789abc',
};
const sleep = vi.fn(async (_ms: number) => {});
const mockResponse = (status: number, headers = {}) =>
  json({ error: { message: KEY } }, status, headers) as unknown as Awaited<
    ReturnType<typeof fetch>
  >;
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected failure');
    },
    (error: AlgaApiError) => error,
  );
beforeEach(() => {
  vi.stubEnv('ALGA_ALLOW_PRIVATE_INSTANCE', 'false');
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  sleep.mockClear();
});
afterEach(() => {
  setGatewayMode(false);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it('sends API and tenant headers, manual redirects, a 30s timeout and safe dispatcher', async () => {
  vi.mocked(fetch).mockResolvedValue(mockResponse(200));
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  await requestAlga(creds, '/clients', { page: 0, limit: 500, search: 'a&b' });
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toBe('https://psa.example.com/api/v1/clients?page=1&limit=100&search=a%26b');
  expect(init).toMatchObject({
    redirect: 'manual',
    headers: { 'x-api-key': KEY, 'x-tenant-id': '12345678-1234-1234-1234-123456789abc' },
  });
  expect(init?.dispatcher).toBeDefined();
  expect(timeout).toHaveBeenCalledWith(30_000);
});
it('omits optional tenant header and supports explicit timeout', async () => {
  vi.mocked(fetch).mockResolvedValue(mockResponse(200));
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  await requestAlga(
    { ...creds, tenantId: undefined },
    '/clients',
    {},
    {
      timeoutMs: 5,
    },
  );
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).not.toHaveProperty('x-tenant-id');
  expect(timeout).toHaveBeenCalledWith(5);
});
it.each([429, 502, 503, 504])('retries HTTP %s and succeeds', async (status) => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(mockResponse(status, { 'retry-after': '0' }))
    .mockResolvedValueOnce(mockResponse(200));
  await requestAlga(creds, '/clients', {}, { sleep });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(0);
});
it.each([500, 408])('does not retry HTTP %s', async (status) => {
  vi.mocked(fetch).mockResolvedValue(mockResponse(status));
  await expect(requestAlga(creds, '/clients', {}, { sleep })).rejects.toThrow(`HTTP ${status}`);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});
it('only ever sends GET without a body', async () => {
  vi.mocked(fetch).mockResolvedValue(mockResponse(200));
  await requestAlga(creds, '/clients');
  const init = vi.mocked(fetch).mock.calls[0][1];
  expect(init?.method).toBe('GET');
  expect(init?.body).toBeUndefined();
  expect(init?.headers).not.toHaveProperty('content-type');
});
it.each([429, 502, 503, 504])('stops after three retries for HTTP %s', async (status) => {
  vi.mocked(fetch).mockImplementation(async () => mockResponse(status, { 'retry-after': '9000' }));
  await expect(requestAlga(creds, '/clients', {}, { sleep })).rejects.toThrow(
    status === 429 ? AlgaRateLimitError : AlgaApiError,
  );
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([60_000, 60_000, 60_000]);
});
it('parses Retry-After seconds, HTTP dates, caps and fallback backoff', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  expect(retryAfterMs('2')).toBe(2000);
  expect(retryAfterMs('0')).toBe(0);
  expect(retryAfterMs('Thu, 01 Jan 2026 00:00:08 GMT', 0, now)).toBe(8000);
  expect(retryAfterMs('Wed, 31 Dec 2025 23:00:00 GMT', 0, now)).toBe(0);
  expect(retryAfterMs('900')).toBe(60_000);
  expect(retryAfterMs('nonsense', 2)).toBe(4000);
  expect(retryAfterMs(null)).toBe(1000);
});
it.each([301, 302, 303, 307, 308])(
  'refuses HTTP %s without following the redirect',
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(status, { location: 'http://169.254.169.254/' }),
    );
    await expect(requestAlga(creds, '/clients')).rejects.toThrow('redirected the request');
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([400, 401, 403, 404, 409, 422, 429, 500])(
  'maps HTTP %s without reflecting upstream errors',
  async (status) => {
    vi.mocked(fetch).mockImplementation(async () => mockResponse(status, { 'retry-after': '0' }));
    try {
      await requestAlga(creds, '/clients', {}, { sleep });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(
        status === 401
          ? AlgaAuthError
          : status === 403
            ? AlgaForbiddenError
            : status === 429
              ? AlgaRateLimitError
              : AlgaApiError,
      );
      expect((error as AlgaApiError).status).toBe(status);
      expect((error as Error).message).not.toContain(KEY);
    }
  },
);
it('sanitizes network and response-body failures', async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error(`failed ${KEY}`));
  await expect(requestAlga(creds, '/clients')).rejects.toThrow(
    'The request to Alga timed out or failed. Try again shortly.',
  );
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      new ReadableStream({
        start(c) {
          c.error(new Error(KEY));
        },
      }),
    ) as never,
  );
  await expect(requestAlga(creds, '/clients')).rejects.toThrow(
    'The request to Alga timed out or failed. Try again shortly.',
  );
});
it('rejects invalid JSON successes, handles empty successes', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('oops') as never);
  await expect(requestAlga(creds, '/clients')).rejects.toThrow('invalid JSON');
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }) as never);
  await expect(requestAlga(creds, '/clients/c1')).resolves.toEqual({ data: null });
});
it('passes page through (floored at 1) and clamps limit to the Alga max of 100', () => {
  expect([clampPage(undefined), clampPage(-1), clampPage(101), clampPage(3.8)]).toEqual([
    1, 1, 101, 3,
  ]);
  expect([
    clampLimit(undefined),
    clampLimit(0),
    clampLimit(101),
    clampLimit(NaN),
    clampLimit(7.9),
  ]).toEqual([25, 1, 100, 25, 7]);
});
it('never falls back to env in gateway mode and isolates concurrent credential contexts', async () => {
  vi.stubEnv('ALGA_API_KEY', 'env-key');
  vi.stubEnv('ALGA_INSTANCE_URL', creds.instanceUrl);
  setGatewayMode(true);
  expect(getCredentials()).toBeNull();
  const check = (apiKey: string) =>
    runWithCredentials({ ...creds, apiKey }, async () => {
      await Promise.resolve();
      expect(getCredentials()?.apiKey).toBe(apiKey);
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(getCredentials()?.apiKey).toBe(apiKey);
    });
  await Promise.all([check('a'), check('b')]);
  expect(getCredentials()).toBeNull();
  setGatewayMode(false);
  expect(getCredentials()?.apiKey).toBe('env-key');
});
it('ignores AUTH_MODE: only setGatewayMode controls env fallback', () => {
  vi.stubEnv('AUTH_MODE', 'gateway');
  vi.stubEnv('ALGA_API_KEY', KEY);
  vi.stubEnv('ALGA_INSTANCE_URL', creds.instanceUrl);
  expect(getCredentials()?.apiKey).toBe(KEY);
});
it('reads standalone env credentials', () => {
  vi.stubEnv('AUTH_MODE', 'env');
  vi.stubEnv('ALGA_API_KEY', KEY);
  vi.stubEnv('ALGA_INSTANCE_URL', creds.instanceUrl);
  vi.stubEnv('ALGA_TENANT_ID', '12345678-1234-1234-1234-123456789abc');
  expect(getCredentials()).toEqual(creds);
});
it('caps compact response bytes with a truncation note and redacts secrets', () => {
  const result = renderResponse({ data: '💡'.repeat(MAX_RESPONSE_BYTES) });
  expect(Buffer.byteLength(result)).toBeLessThan(MAX_RESPONSE_BYTES + 150);
  expect(result).toContain('[TRUNCATED:');
  expect(renderResponse({ data: KEY }, [KEY])).not.toContain(KEY);
  expect(renderResponse({ data: 'a"bcd' }, ['a"bcd'])).not.toContain('a\\"bcd');
});
it('does not log credentials in structured context or exception messages', () => {
  vi.stubEnv('ALGA_API_KEY', KEY);
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
  logger.error(`error ${KEY}`, { apiKey: 'header-secret', nested: { secret: 'other-secret' } });
  const output = JSON.stringify(stderr.mock.calls);
  for (const secret of [KEY, 'header-secret', 'other-secret']) expect(output).not.toContain(secret);
});
it('rejects arguments and missing credentials before fetch', async () => {
  setGatewayMode(true);
  expect((await dispatchToolCall('alga_clients_list', {}, {})).isError).toBe(true);
  expect((await dispatchToolCall('alga_clients_list', { unknown: 'x' }, {})).isError).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
const streamOf = (chunks: number, size: number, onCancel: () => void) => {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ >= chunks) controller.close();
      else controller.enqueue(new Uint8Array(size).fill(0x20));
    },
    cancel: onCancel,
  });
};
const GET_TOO_LARGE =
  'Alga sent a response larger than 4 MiB, so it was not read. Narrow the request with filters, fields or a smaller limit and try again.';
it('rejects a content-length over the upstream cap without reading the body', async () => {
  expect(MAX_UPSTREAM_RESPONSE_BYTES).toBe(4 * 1024 * 1024);
  const cancel = vi.fn();
  const body = streamOf(1, 10, cancel);
  vi.mocked(fetch).mockResolvedValue(
    new Response(body, { status: 200, headers: { 'content-length': '999999' } }) as never,
  );
  const error = await failure(
    requestAlga(
      creds,
      '/clients',
      {},
      {
        maxResponseBytes: 1000,
      },
    ),
  );
  expect(error).toBeInstanceOf(AlgaApiError);
  expect(error.message).toBe(GET_TOO_LARGE);
  expect(cancel).toHaveBeenCalled();
  expect(body.locked).toBe(false);
});
it('aborts a chunked stream part-way once it passes the cap', async () => {
  const cancel = vi.fn();
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(400).fill(0x20));
    },
    cancel,
  });
  vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 200 }) as never);
  const error = await failure(requestAlga(creds, '/clients', {}, { maxResponseBytes: 1000 }));
  expect(error).toBeInstanceOf(AlgaApiError);
  expect(error.message).toBe(GET_TOO_LARGE);
  expect(cancel).toHaveBeenCalled();
  expect(pulled).toBeLessThan(10);
});
it('reads a streamed body under the cap, including split multi-byte characters', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ data: 'é💡' }));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 200 }) as never);
  await expect(requestAlga(creds, '/clients')).resolves.toEqual({ data: 'é💡' });
});

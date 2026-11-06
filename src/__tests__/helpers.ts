import { beforeEach, afterEach, expect, it, vi, type MockedFunction } from 'vitest';
import { dispatchToolCall } from '../tools/index.js';
import { getCredentials } from '../alga-client.js';
import * as dns from 'node:dns/promises';
import * as undici from 'undici';

export const KEY = 'test-key-not-a-real-credential';
export const json = (
  body: unknown = { data: [] },
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), { status, headers });
export type RouteCase = [
  name: string,
  method: string,
  path: string,
  args?: Record<string, unknown>,
  query?: Record<string, unknown>,
  body?: Record<string, unknown>,
];
/** Expected routes and wire payloads are authored independently of the inventory. */
export function routeTests(cases: RouteCase[]) {
  // Spies must be installed per test because restoreAllMocks removes them.
  let fetch: MockedFunction<typeof undici.fetch>;
  beforeEach(() => {
    vi.stubEnv('AUTH_MODE', 'env');
    vi.stubEnv('ALGA_INSTANCE_URL', 'https://psa.example.com');
    vi.stubEnv('ALGA_API_KEY', KEY);
    vi.stubEnv('ALGA_TENANT_ID', '12345678-1234-1234-1234-123456789abc');
    vi.stubEnv('ALGA_ALLOW_PRIVATE_INSTANCE', 'false');
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    fetch = vi
      .spyOn(undici, 'fetch')
      .mockResolvedValue(
        json({ data: [{ id: 'result' }], pagination: { page: 2 } }) as unknown as Awaited<
          ReturnType<typeof undici.fetch>
        >,
      );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  for (const [name, method, path, args = {}, query = {}, body] of cases) {
    it(`${name} sends ${method} ${path}`, async () => {
      expect(getCredentials()?.apiKey).toBe(KEY);
      const result = await dispatchToolCall(name, args, {
        ALGA_ENABLE_WRITES: 'true',
        ALGA_ENABLE_DESTRUCTIVE: 'true',
      });
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [rawUrl, init] = fetch.mock.calls[0];
      const url = new URL(String(rawUrl));
      expect(url.origin).toBe('https://psa.example.com');
      expect(url.pathname).toBe(`/api/v1${path}`);
      expect(Object.fromEntries(url.searchParams)).toEqual(
        Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
      );
      expect(init?.method).toBe(method);
      expect(init?.redirect).toBe('manual');
      expect(init?.dispatcher).toBeInstanceOf(undici.Agent);
      expect(init?.headers).toMatchObject({
        'x-api-key': KEY,
        'x-tenant-id': '12345678-1234-1234-1234-123456789abc',
      });
      expect(init?.body ? JSON.parse(String(init.body)) : undefined).toEqual(body);
      expect(JSON.parse(unwrap((result.content[0] as { text: string }).text))).toEqual({
        data: [{ id: 'result' }],
        pagination: { page: 2 },
      });
    });
  }
}
/** Strips the untrusted-content envelope from a successful tool result. */
export const unwrap = (text: string) =>
  text
    .replace(/^[^\n]*\n<untrusted-content nonce="[0-9a-f]+">\n/, '')
    .replace(/\n<\/untrusted-content nonce="[0-9a-f]+">$/, '');
export const page = { page: 1, limit: 25 };

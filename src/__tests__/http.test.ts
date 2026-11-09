import { createHmac } from 'node:crypto';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
import { startHttpServer } from '../http.js';
import { setGatewayMode } from '../alga-client.js';
import { verifyS2sHeader } from '../s2s-verify.js';
import { MAX_REQUEST_BODY_BYTES } from '../input-limits.js';
import { KEY, json } from './helpers.js';
const SECRET = 'test-s2s-fixture-opaque-value-0123456789';
const servers: Server[] = [];
const proof = (secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`t=${t}`).digest('hex')}`;
const creds = {
  'x-alga-api-key': KEY,
  'x-alga-instance-url': 'https://psa.example.com',
  'x-alga-tenant-id': '12345678-1234-1234-1234-123456789abc',
};
const toolCall = (name = 'alga_users_list', args = {}) =>
  JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
async function listen() {
  const server = await startHttpServer();
  servers.push(server);
  return { server, port: (server.address() as AddressInfo).port };
}
function send(
  port: number,
  headers: Record<string, string> = {},
  body = toolCall(),
  path = '/mcp',
  method = 'POST',
  chunked = false,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(chunked
            ? { 'transfer-encoding': 'chunked' }
            : { 'content-length': String(Buffer.byteLength(body)) }),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode!, text }));
      },
    );
    req.setTimeout(5000, () => req.destroy(new Error('HTTP fixture timed out')));
    req.on('error', reject);
    if (chunked) {
      req.write(body.slice(0, 100));
      req.write(body.slice(100));
      req.end();
    } else req.end(body);
  });
}
beforeEach(() => {
  vi.stubEnv('CONDUIT_S2S_SECRET', SECRET);
  vi.stubEnv('MCP_HTTP_PORT', '0');
  vi.stubEnv('MCP_HTTP_HOST', '127.0.0.1');
  vi.stubEnv('AUTH_MODE', 'gateway');
  vi.stubEnv('ALGA_API_KEY', 'env-only-key');
  vi.stubEnv('ALGA_INSTANCE_URL', 'https://env.example.com');
  vi.stubEnv('ALGA_TENANT_ID', '12345678-1234-1234-1234-123456789abc');
  vi.stubEnv('ALGA_ALLOW_PRIVATE_INSTANCE', 'false');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('MCP_ALLOW_INSECURE_DEV', '');
  vi.stubEnv('READ_ONLY_MODE', 'false');
  vi.stubEnv('ALGA_ENABLE_WRITES', 'false');
  vi.stubEnv('ALGA_ENABLE_DESTRUCTIVE', 'false');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  vi.mocked(fetch).mockImplementation(async () => json({ data: [] }) as never);
});
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setGatewayMode(false);
});
it('refuses to start without S2S secret', async () => {
  vi.stubEnv('CONDUIT_S2S_SECRET', '');
  vi.stubEnv('MCP_ALLOW_INSECURE_DEV', '');
  await expect(startHttpServer()).rejects.toThrow('CONDUIT_S2S_SECRET is empty');
});
it.each([
  'changeme',
  'change-me',
  'secret',
  'example',
  'placeholder',
  'replace-me',
  'your-secret',
  'your-s2s-secret',
  's2s-secret',
  'replace-with-a-real-secret',
  ' SECRET ',
])('refuses placeholder %s even with insecure dev enabled', async (secret) => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('CONDUIT_S2S_SECRET', secret);
  vi.stubEnv('MCP_ALLOW_INSECURE_DEV', '1');
  await expect(startHttpServer()).rejects.toThrow('known placeholder');
});
it.each(['production', 'staging', ''])(
  'refuses insecure dev with NODE_ENV=%j, before any secret check',
  async (env) => {
    vi.stubEnv('NODE_ENV', env);
    vi.stubEnv('CONDUIT_S2S_SECRET', 'changeme');
    vi.stubEnv('MCP_ALLOW_INSECURE_DEV', '1');
    await expect(startHttpServer()).rejects.toThrow(
      'Refusing to start HTTP transport: MCP_ALLOW_INSECURE_DEV requires NODE_ENV=development.',
    );
  },
);
it.each(['', '0', 'false'])(
  'ignores the insecure dev flag value %j outside development',
  async (v) => {
    vi.stubEnv('MCP_ALLOW_INSECURE_DEV', v);
    const { port } = await listen();
    expect(port).toBeGreaterThan(0);
  },
);
it('starts insecure dev on 127.0.0.1 with NODE_ENV=development and an empty secret', async () => {
  vi.stubEnv('NODE_ENV', ' Development ');
  vi.stubEnv('CONDUIT_S2S_SECRET', '');
  vi.stubEnv('MCP_ALLOW_INSECURE_DEV', '1');
  const { server } = await listen();
  expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
});
it.each(['a', 'x'.repeat(31)])('refuses a short S2S secret without echoing it', async (secret) => {
  vi.stubEnv('CONDUIT_S2S_SECRET', secret);
  const error = await startHttpServer().then(
    () => new Error('started'),
    (e: Error) => e,
  );
  expect(error.message).toBe(
    'Refusing to start HTTP transport: CONDUIT_S2S_SECRET must be at least 32 characters. Generate one with `openssl rand -hex 32`.',
  );
  if (secret.length > 1) {
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  }
});
it('starts with a 32-character S2S secret', async () => {
  vi.stubEnv('CONDUIT_S2S_SECRET', '0123456789abcdef0123456789ABCDEF');
  const { port } = await listen();
  expect(port).toBeGreaterThan(0);
});
it.each([
  ['x'.repeat(32), 'repeated'],
  ['abcd'.repeat(10), 'repeated'],
  ['aabbccdd'.repeat(4) + 'abab', 'too few distinct characters'],
  ['replace-with-openssl-rand-hex-32-0123456789', 'placeholder'],
])('refuses a weak S2S secret %#', async (secret, reason) => {
  vi.stubEnv('CONDUIT_S2S_SECRET', secret);
  const error = await startHttpServer().then(
    () => new Error('started'),
    (e: Error) => e,
  );
  expect(error.message).toContain('Refusing to start HTTP transport: CONDUIT_S2S_SECRET');
  expect(error.message).toContain(reason);
  expect(error.message).not.toContain(secret);
});
it.each(['Gateway', 'garbage', ' gateway2'])('refuses AUTH_MODE=%j', async (mode) => {
  vi.stubEnv('AUTH_MODE', mode);
  await expect(startHttpServer()).rejects.toThrow(
    `AUTH_MODE must be 'gateway' or 'env'. Got ${JSON.stringify(mode)}.`,
  );
});
it.each([undefined, '', ' gateway '])('treats AUTH_MODE=%j as gateway', async (mode) => {
  if (mode === undefined) delete process.env.AUTH_MODE;
  else vi.stubEnv('AUTH_MODE', mode);
  const { port } = await listen();
  const health = await send(port, {}, '', '/health', 'GET');
  expect(JSON.parse(health.text)).toMatchObject({ mode: 'gateway' });
  const result = await send(port, { 'x-gateway-s2s': proof() });
  expect(result.status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it('limits insecure dev to loopback and logs a warning', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('CONDUIT_S2S_SECRET', '');
  vi.stubEnv('MCP_ALLOW_INSECURE_DEV', '1');
  vi.stubEnv('MCP_HTTP_HOST', '0.0.0.0');
  const { server, port } = await listen();
  expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain('SECURITY WARNING');
  expect((await send(port, creds)).status).toBe(200);
});
it('still enforces a configured secret with insecure dev enabled', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('MCP_ALLOW_INSECURE_DEV', '1');
  const { port } = await listen();
  expect((await send(port, creds)).status).toBe(401);
});
it.each([undefined, '', 'junk', proof('wrong-secret'), proof(SECRET, 1)])(
  'rejects missing or invalid S2S proof %s before credentials, DNS or API',
  async (header) => {
    const { port } = await listen();
    const result = await send(port, header === undefined ? {} : { 'x-gateway-s2s': header });
    expect(result.status).toBe(401);
    expect(JSON.parse(result.text)).toHaveProperty('error');
    expect(lookup).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each<Record<string, string>>([
  {},
  { 'x-alga-instance-url': 'https://psa.example.com' },
  { 'x-alga-api-key': KEY },
])('rejects missing gateway credentials without env fallback: %j', async (headers) => {
  const { port } = await listen();
  const result = await send(port, { ...headers, 'x-gateway-s2s': proof() });
  expect(result.status).toBe(401);
  expect(JSON.parse(result.text)).toHaveProperty('error');
  expect(fetch).not.toHaveBeenCalled();
  expect(lookup).not.toHaveBeenCalled();
});
it.each([
  'bad-url',
  'http://psa.example.com',
  'https://localhost',
  'https://user:pass@psa.example.com',
  'https://psa.example.com?x=1',
])('rejects bad instance URL %s before MCP', async (instanceUrl) => {
  const { port } = await listen();
  const result = await send(port, {
    ...creds,
    'x-gateway-s2s': proof(),
    'x-alga-instance-url': instanceUrl,
  });
  expect(result.status).toBe(400);
  expect(JSON.parse(result.text)).toHaveProperty('error');
  expect(result.text).not.toContain(KEY);
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects private DNS and ignores header attempts to enable private access', async () => {
  vi.mocked(lookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);
  const { port } = await listen();
  expect(
    (
      await send(port, {
        ...creds,
        'x-gateway-s2s': proof(),
        'alga-allow-private-instance': 'true',
      })
    ).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it('uses per-request credentials and never uses environment tenant or key', async () => {
  const { port } = await listen();
  const result = await send(port, { ...creds, 'x-gateway-s2s': proof() });
  expect(result.status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
    'x-api-key': KEY,
    'x-tenant-id': '12345678-1234-1234-1234-123456789abc',
  });
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
    'https://psa.example.com/api/v1/users',
  );
  for (const text of [result.text, JSON.stringify(vi.mocked(console.error).mock.calls)])
    for (const secret of [KEY, SECRET, 'env-only-key']) expect(text).not.toContain(secret);
});
it('omits tenant header when gateway caller omits it', async () => {
  const { port } = await listen();
  await send(port, {
    'x-alga-api-key': KEY,
    'x-alga-instance-url': 'https://psa.example.com',
    'x-gateway-s2s': proof(),
  });
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).not.toHaveProperty('x-tenant-id');
});
it('keeps concurrent requests in separate credential contexts without sessions', async () => {
  const { port } = await listen();
  const calls = await Promise.all(
    ['one', 'two'].map((key) =>
      send(port, {
        'x-alga-api-key': key,
        'x-alga-instance-url': `https://${key}.example.com`,
        'x-gateway-s2s': proof(),
      }),
    ),
  );
  expect(calls.every((r) => r.status === 200)).toBe(true);
  for (const [url, init] of vi.mocked(fetch).mock.calls) {
    const key = (init?.headers as Record<string, string>)['x-api-key'];
    expect(new URL(String(url)).hostname).toBe(`${key}.example.com`);
  }
  expect((await send(port, { 'x-gateway-s2s': proof() })).status).toBe(401);
});
it('env mode reads standalone credentials with S2S enforced', async () => {
  vi.stubEnv('AUTH_MODE', 'env');
  const { port } = await listen();
  expect((await send(port, { 'x-gateway-s2s': proof() })).status).toBe(200);
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
    'x-api-key': 'env-only-key',
    'x-tenant-id': '12345678-1234-1234-1234-123456789abc',
  });
});
it('health is unauthenticated liveness with no DNS or vendor calls or secrets', async () => {
  const { port } = await listen();
  const result = await send(port, {}, '', '/health', 'GET');
  expect(result.status).toBe(200);
  expect(JSON.parse(result.text)).toMatchObject({ status: 'ok', mode: 'gateway' });
  expect(lookup).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  for (const secret of [KEY, SECRET, 'env-only-key', '12345678-1234-1234-1234-123456789abc'])
    expect(result.text).not.toContain(secret);
});
it('returns 404 for unknown paths', async () => {
  const { port } = await listen();
  expect((await send(port, {}, '', '/other', 'GET')).status).toBe(404);
});
it('returns 413 for declared oversized bodies only after S2S', async () => {
  const { port } = await listen();
  const body = JSON.stringify({ pad: 'x'.repeat(MAX_REQUEST_BODY_BYTES) });
  expect((await send(port, {}, body)).status).toBe(401);
  const result = await send(port, { ...creds, 'x-gateway-s2s': proof() }, body);
  expect(result.status).toBe(413);
  expect(JSON.parse(result.text).error.code).toBe(-32600);
  expect(fetch).not.toHaveBeenCalled();
});
it('caps chunked bodies without trusting Content-Length', async () => {
  const { port } = await listen();
  const body = JSON.stringify({ pad: 'x'.repeat(MAX_REQUEST_BODY_BYTES) });
  const result = await send(
    port,
    { ...creds, 'x-gateway-s2s': proof() },
    body,
    '/mcp',
    'POST',
    true,
  );
  expect(result.status).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
});
it('supports stateless initialize and tools/list', async () => {
  const { port } = await listen();
  const headers = { ...creds, 'x-gateway-s2s': proof() };
  const init = await send(
    port,
    headers,
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    }),
  );
  expect(init.status).toBe(200);
  const list = await send(
    port,
    headers,
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  );
  expect(list.status).toBe(200);
  const tools = JSON.parse(list.text).result.tools;
  expect(tools).toHaveLength(42);
  for (const tool of tools)
    expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
  expect(fetch).not.toHaveBeenCalled();
});
const listOver = async (port: number, headers: Record<string, string>) =>
  JSON.parse(
    (await send(port, headers, JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })))
      .text,
  ).result.tools as { name: string }[];
it('X-Conduit-Tool-Tiers present but empty exposes zero tools and refuses calls', async () => {
  vi.stubEnv('ALGA_ENABLE_WRITES', 'true');
  vi.stubEnv('ALGA_ENABLE_DESTRUCTIVE', 'true');
  const { port } = await listen();
  const headers = { ...creds, 'x-gateway-s2s': proof() };
  expect(await listOver(port, headers)).toHaveLength(72);
  expect(await listOver(port, { ...headers, 'x-conduit-tool-tiers': '' })).toEqual([]);
  expect(await listOver(port, { ...headers, 'x-conduit-tool-tiers': 'read' })).toHaveLength(42);
  const call = await send(
    port,
    { ...headers, 'x-conduit-tool-tiers': '' },
    toolCall('alga_users_list'),
  );
  expect(JSON.parse(call.text).result.isError).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
it('X-Conduit-Tool-Tiers cannot widen past the container flags', async () => {
  const { port } = await listen();
  const headers = {
    ...creds,
    'x-gateway-s2s': proof(),
    'x-conduit-tool-tiers': 'read,write,destructive',
  };
  expect(await listOver(port, headers)).toHaveLength(42);
});
it('serves one mocked end-to-end read through gateway headers', async () => {
  vi.mocked(fetch).mockImplementation(
    async () => json({ data: [{ team_id: 't1', team_name: 'Tier 1' }] }) as never,
  );
  const { port } = await listen();
  const result = await send(
    port,
    { ...creds, 'x-gateway-s2s': proof(), 'x-conduit-tool-tiers': 'read' },
    toolCall('alga_teams_list', { team_name: 'Tier' }),
  );
  expect(result.status).toBe(200);
  const body = JSON.parse(result.text).result;
  expect(body.isError).not.toBe(true);
  expect(body.content[0].text).toContain('<untrusted-content nonce=');
  expect(body.content[0].text).toContain('"team_name":"Tier 1"');
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toBe('https://psa.example.com/api/v1/teams?page=1&limit=25&team_name=Tier');
  expect(init?.method).toBe('GET');
  expect(init?.headers).toEqual({
    accept: 'application/json',
    'x-api-key': KEY,
    'x-tenant-id': '12345678-1234-1234-1234-123456789abc',
  });
  expect(result.text).not.toContain(KEY);
});
it('rejects disabled and oversized tool inputs at the MCP boundary', async () => {
  const { port } = await listen();
  const headers = { ...creds, 'x-gateway-s2s': proof() };
  const disabled = await send(port, headers, toolCall('alga_clients_delete', { id: 'c1' }));
  expect(JSON.parse(disabled.text).result.isError).toBe(true);
  const oversized = await send(
    port,
    headers,
    toolCall('alga_users_list', { nested: Array(10001).fill(1) }),
  );
  expect(JSON.parse(oversized.text).result.isError).toBe(true);
  expect(oversized.text).toContain('10000');
  expect(fetch).not.toHaveBeenCalled();
});
it('verifies timestamp bounds and malformed signatures', () => {
  expect(verifyS2sHeader(proof(), SECRET)).toBe(true);
  for (const value of [
    proof(SECRET, Math.floor(Date.now() / 1000) + 301),
    proof(SECRET, 1),
    't=NaN,v1=00',
    't=1,v1=' + 'a'.repeat(63),
    't=9999999999999999,v1=' + '0'.repeat(64),
    undefined,
  ])
    expect(verifyS2sHeader(value, SECRET)).toBe(false);
  expect(verifyS2sHeader(proof(), '')).toBe(false);
});

it('rejects a malformed tenant UUID before MCP or API access', async () => {
  const { port } = await listen();
  const result = await send(port, {
    ...creds,
    'x-gateway-s2s': proof(),
    'x-alga-tenant-id': 'wrong',
  });
  expect(result.status).toBe(400);
  expect(result.text).toContain('Leave it blank');
  expect(fetch).not.toHaveBeenCalled();
});
it('ignores an empty tenant header', async () => {
  const { port } = await listen();
  const result = await send(port, { ...creds, 'x-gateway-s2s': proof(), 'x-alga-tenant-id': '' });
  expect(result.status).toBe(200);
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).not.toHaveProperty('x-tenant-id');
});

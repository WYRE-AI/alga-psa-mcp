import { it, expect, vi, afterEach } from 'vitest';
import { ALL_TOOLS, selectTools, listTools, dispatchToolCall } from '../tools/index.js';
import { validateArgs } from '../executor.js';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
afterEach(() => vi.restoreAllMocks());
it('has exactly 71 unique tools: 41 read, 18 write, 12 destructive', () => {
  expect(ALL_TOOLS).toHaveLength(71);
  expect(new Set(ALL_TOOLS.map((t) => t.name)).size).toBe(71);
  for (const [tier, count] of [
    ['read', 41],
    ['write', 18],
    ['destructive', 12],
  ] as const)
    expect(ALL_TOOLS.filter((t) => t.tier === tier)).toHaveLength(count);
  expect(selectTools({})).toHaveLength(41);
});
const W = { ALGA_ENABLE_WRITES: 'true' };
it('lists 41 read tools by default, 59 with writes, 71 with destructive', () => {
  expect(listTools({})).toHaveLength(41);
  expect(listTools(W)).toHaveLength(59);
  expect(listTools({ ...W, ALGA_ENABLE_DESTRUCTIVE: 'true' })).toHaveLength(71);
});
it('does not enable destructive tools without writes', () => {
  expect(listTools({ ALGA_ENABLE_DESTRUCTIVE: 'true' })).toHaveLength(41);
});
it.each(['true', 'TRUE', '1', ' true '])('enables writes and destructive with %s', (value) =>
  expect(selectTools({ ALGA_ENABLE_WRITES: value, ALGA_ENABLE_DESTRUCTIVE: value })).toHaveLength(
    71,
  ),
);
it.each(['false', '0', 'yes', 'truex', '2', ''])(
  'does not enable writes or destructive with %s',
  (value) => {
    expect(selectTools({ ALGA_ENABLE_WRITES: value })).toHaveLength(41);
    expect(selectTools({ ...W, ALGA_ENABLE_DESTRUCTIVE: value })).toHaveLength(59);
  },
);
it.each(['true', '1', 'TRUE'])('read-only wins with %s', (value) => {
  const tools = selectTools({
    READ_ONLY_MODE: value,
    ...W,
    ALGA_ENABLE_DESTRUCTIVE: 'true',
  });
  expect(tools).toHaveLength(41);
  expect(tools.every((t) => t.tier === 'read')).toBe(true);
});
it('annotates every tool, prefixes destructive descriptions and keeps schemas closed', () => {
  const listed = listTools({ ...W, ALGA_ENABLE_DESTRUCTIVE: 'true' });
  for (const tool of ALL_TOOLS) {
    const exposed = listed.find((t) => t.name === tool.name)!;
    expect(tool.name).toMatch(/^alga_[a-z0-9_]+$/);
    expect(tool.description.length).toBeLessThanOrEqual(300);
    expect(exposed.annotations).toEqual({
      readOnlyHint: tool.tier === 'read',
      destructiveHint: tool.tier === 'destructive',
    });
    if (tool.tier === 'destructive') expect(tool.description).toMatch(/^⚠ DESTRUCTIVE: /);
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(() => validateArgs(tool, { surprise: 'not allowed' })).toThrow();
    for (const [key, field] of Object.entries(tool.inputSchema.properties)) {
      if (
        key === 'id' ||
        (/Id$|_id$/.test(key) && key !== 'external_id' && key !== 'external_parent_id')
      ) {
        expect(field).toMatchObject({
          type: 'string',
          maxLength: 128,
          pattern: '^[A-Za-z0-9_\\-:.]+$',
        });
      }
    }
    if (tool.paginated)
      for (const key of ['page', 'limit', 'sort', 'order', 'fields'])
        expect(tool.inputSchema.properties).toHaveProperty(key);
  }
});
it('keeps the full JSON-RPC tools/list payload below 60KB', () => {
  expect(
    Buffer.byteLength(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { tools: listTools({ ...W, ALGA_ENABLE_DESTRUCTIVE: 'true' }) },
      }),
    ),
  ).toBeLessThan(60_000);
});
it('never exposes prohibited routes or user mutations', () => {
  const prohibited =
    /\/(rmm|secrets|webhooks|workflows|tenants|auth|extensions|bulk)(\/|$)|\/(password|2fa|roles)(\/|$)|\/invoices\/[^/]+\/(payment|credit)(\/|$)/i;
  for (const tool of ALL_TOOLS) {
    expect(tool.path, tool.name).not.toMatch(prohibited);
    expect(!(tool.path.startsWith('/users') && tool.method !== 'GET')).toBe(true);
    expect(!(tool.path.startsWith('/invoices') && tool.method === 'DELETE')).toBe(true);
    expect(tool.path).toMatch(/^\/[a-z]/);
  }
});
it('rejects unknown, disabled and read-only writes by name', async () => {
  for (const tool of ALL_TOOLS.filter((t) => t.tier !== 'read')) {
    const result = await dispatchToolCall(
      tool.name,
      {},
      { READ_ONLY_MODE: 'true', ...W, ALGA_ENABLE_DESTRUCTIVE: 'true' },
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain(
      `${tool.name} is turned off because this container is in read-only mode. An admin can turn it off by setting READ_ONLY_MODE=false.`,
    );
  }
  for (const tool of ALL_TOOLS.filter((t) => t.tier === 'destructive'))
    expect((await dispatchToolCall(tool.name, {}, W)).isError).toBe(true);
  expect((await dispatchToolCall('not_a_tool', {}, {})).isError).toBe(true);
});
it('does not allow callers to publish knowledge articles', async () => {
  const tool = ALL_TOOLS.find((t) => t.name === 'alga_kb_articles_create')!;
  expect(() => validateArgs(tool, { title: 'T', status: 'published' })).toThrow('Unknown');
});
it('refuses writes by name before any network call, with tier-specific text', async () => {
  const write = await dispatchToolCall('alga_tickets_create', {}, {});
  expect(write.isError).toBe(true);
  expect((write.content[0] as { text: string }).text).toBe(
    'Error: alga_tickets_create is turned off because creating and changing records in Alga is off in this container. An admin can turn it on with ALGA_ENABLE_WRITES=true.',
  );
  const destructive = await dispatchToolCall('alga_tickets_delete', { id: 't1' }, W);
  expect((destructive.content[0] as { text: string }).text).toBe(
    'Error: alga_tickets_delete is turned off because destructive actions in Alga are off in this container. An admin can turn them on with ALGA_ENABLE_WRITES=true and ALGA_ENABLE_DESTRUCTIVE=true.',
  );
  const alone = await dispatchToolCall(
    'alga_tickets_delete',
    { id: 't1' },
    { ALGA_ENABLE_DESTRUCTIVE: 'true' },
  );
  expect(JSON.stringify(alone)).toContain('turned off');
  expect(fetch).not.toHaveBeenCalled();
  expect(lookup).not.toHaveBeenCalled();
});

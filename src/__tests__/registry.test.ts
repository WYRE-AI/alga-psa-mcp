import { it, expect, vi, afterEach } from 'vitest';
import { ALL_TOOLS, selectTools, listTools, dispatchToolCall } from '../tools/index.js';
import { validateArgs } from '../executor.js';
afterEach(() => vi.restoreAllMocks());
it('has exactly 71 unique tools: 41 read, 18 write, 12 destructive', () => {
  expect(ALL_TOOLS).toHaveLength(71);
  expect(new Set(ALL_TOOLS.map((t) => t.name)).size).toBe(71);
  for (const [tier, count] of [['read', 41], ['write', 18], ['destructive', 12]] as const) expect(ALL_TOOLS.filter((t) => t.tier === tier)).toHaveLength(count);
  expect(selectTools({})).toHaveLength(59);
});
it.each(['true', 'TRUE', '1'])('enables destructive with %s', (value) => expect(selectTools({ ALGA_ENABLE_DESTRUCTIVE: value })).toHaveLength(71));
it.each(['false', '0', 'yes', 'truex', ' true ', '2', ''])('does not enable destructive with %s', (value) => expect(selectTools({ ALGA_ENABLE_DESTRUCTIVE: value })).toHaveLength(59));
it.each(['true', '1', 'TRUE'])('read-only wins with %s', (value) => {
  const tools = selectTools({ READ_ONLY_MODE: value, ALGA_ENABLE_DESTRUCTIVE: 'true' });
  expect(tools).toHaveLength(41);
  expect(tools.every((t) => t.tier === 'read')).toBe(true);
});
it('annotates every tool, prefixes destructive descriptions and keeps schemas closed', () => {
  const listed = listTools({ ALGA_ENABLE_DESTRUCTIVE: 'true' });
  for (const tool of ALL_TOOLS) {
    const exposed = listed.find((t) => t.name === tool.name)!;
    expect(tool.name).toMatch(/^alga_[a-z0-9_]+$/);
    expect(tool.description.length).toBeLessThanOrEqual(300);
    expect(exposed.annotations).toEqual({ readOnlyHint: tool.tier === 'read', destructiveHint: tool.tier === 'destructive' });
    if (tool.tier === 'destructive') expect(tool.description).toMatch(/^⚠ DESTRUCTIVE: /);
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(() => validateArgs(tool, { surprise: 'not allowed' })).toThrow();
    for (const [key, field] of Object.entries(tool.inputSchema.properties)) {
      if (key === 'id' || /Id$|_id$/.test(key) && key !== 'external_id' && key !== 'external_parent_id') {
        expect(field).toMatchObject({ type: 'string', maxLength: 128, pattern: '^[A-Za-z0-9_\\-:.]+$' });
      }
    }
    if (tool.paginated) for (const key of ['page', 'limit', 'sort', 'order', 'fields']) expect(tool.inputSchema.properties).toHaveProperty(key);
  }
});
it('keeps the full JSON-RPC tools/list payload below 60KB', () => {
  expect(Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: listTools({ ALGA_ENABLE_DESTRUCTIVE: 'true' }) } }))).toBeLessThan(60_000);
});
it('never exposes prohibited routes or user mutations', () => {
  const prohibited = /\/(rmm|secrets|webhooks|workflows|tenants|auth|extensions|bulk)(\/|$)|\/(password|2fa|roles)(\/|$)|\/invoices\/[^/]+\/(payment|credit)(\/|$)/i;
  for (const tool of ALL_TOOLS) {
    expect(tool.path, tool.name).not.toMatch(prohibited);
    expect(!(tool.path.startsWith('/users') && tool.method !== 'GET')).toBe(true);
    expect(!(tool.path.startsWith('/invoices') && tool.method === 'DELETE')).toBe(true);
    expect(tool.path).toMatch(/^\/[a-z]/);
  }
});
it('rejects unknown, disabled and read-only writes by name', async () => {
  for (const tool of ALL_TOOLS.filter((t) => t.tier !== 'read')) {
    const result = await dispatchToolCall(tool.name, {}, { READ_ONLY_MODE: 'true', ALGA_ENABLE_DESTRUCTIVE: 'true' });
    expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain('turned off');
  }
  for (const tool of ALL_TOOLS.filter((t) => t.tier === 'destructive')) expect((await dispatchToolCall(tool.name, {}, {})).isError).toBe(true);
  expect((await dispatchToolCall('not_a_tool', {}, {})).isError).toBe(true);
});
it('does not allow callers to publish knowledge articles', async () => {
  const tool = ALL_TOOLS.find((t) => t.name === 'alga_kb_articles_create')!;
  expect(() => validateArgs(tool, { title: 'T', status: 'published' })).toThrow('Unknown');
});

import { it, expect, vi, afterEach } from 'vitest';
import { ALL_TOOLS, selectTools, listTools, dispatchToolCall } from '../tools/index.js';
import { validateArgs } from '../executor.js';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
afterEach(() => vi.restoreAllMocks());
it('has exactly 42 unique read tools, all listed by default', () => {
  expect(ALL_TOOLS).toHaveLength(42);
  expect(new Set(ALL_TOOLS.map((t) => t.name)).size).toBe(42);
  expect(selectTools({})).toHaveLength(42);
  expect(listTools({})).toHaveLength(42);
});
it('annotates every tool read-only and keeps schemas closed', () => {
  const listed = listTools({});
  for (const tool of ALL_TOOLS) {
    const exposed = listed.find((t) => t.name === tool.name)!;
    expect(tool.name).toMatch(/^alga_[a-z0-9_]+$/);
    expect(tool.description.length).toBeLessThanOrEqual(300);
    expect(tool.description).not.toMatch(/DESTRUCTIVE/);
    expect(exposed.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
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
    Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: listTools({}) } })),
  ).toBeLessThan(60_000);
});
it('never exposes prohibited routes', () => {
  const prohibited =
    /\/(rmm|secrets|webhooks|workflows|tenants|auth|extensions|bulk)(\/|$)|\/(password|2fa|roles)(\/|$)|\/invoices\/[^/]+\/(payment|credit)(\/|$)/i;
  for (const tool of ALL_TOOLS) {
    expect(tool.path, tool.name).not.toMatch(prohibited);
    expect(tool.path).toMatch(/^\/[a-z]/);
  }
});
it('refuses unknown tools by name before any network call', async () => {
  const result = await dispatchToolCall('alga_tickets_purge', {}, {});
  expect(result.isError).toBe(true);
  expect((result.content[0] as { text: string }).text).toBe(
    'Error: Unknown tool. Choose a tool from tools/list.',
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(lookup).not.toHaveBeenCalled();
});

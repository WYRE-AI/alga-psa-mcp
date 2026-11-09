// Pagination-safe truncation: an oversized list page drops rows from the end of
// data and keeps every other top-level field, so the model can still page on.
import { afterEach, it, expect, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
import { executeTool, MAX_RESPONSE_BYTES, renderResponse, validateArgs } from '../executor.js';
import { ALL_TOOLS } from '../tools/index.js';
import { json, KEY } from './helpers.js';

const creds = { instanceUrl: 'https://psa.example.com', apiKey: KEY };
const tool = (name: string) => ALL_TOOLS.find((t) => t.name === name)!;
/** Runs a tool against an oversized Alga reply and returns the parsed, truncated result. */
async function truncated(name: string, args: Record<string, unknown>, reply: unknown) {
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  vi.mocked(fetch).mockImplementation(async () => json(reply) as never);
  const out = JSON.parse(await executeTool(tool(name), args, creds));
  expect(out.truncated).toBe(true);
  return out;
}
afterEach(() => vi.restoreAllMocks());

const pagination = { page: 2, limit: 100, total: 500, totalPages: 5, hasNext: true, hasPrev: true };
const row = (i: number) => ({ ticket_id: `t-${i}`, title: `Ticket ${i}`, body: 'x'.repeat(2000) });
const bigPage = (rows = 100) => ({
  data: Array.from({ length: rows }, (_, i) => row(i)),
  pagination,
  meta: { resource: 'ticket' },
});

it('shrinks an oversized list page to valid JSON under the cap', () => {
  const text = renderResponse(bigPage());
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES);
  expect(() => JSON.parse(text)).not.toThrow();
});

it('keeps pagination and other top-level fields when it shrinks a page', () => {
  const out = JSON.parse(renderResponse(bigPage()));
  expect(out.pagination).toEqual(pagination);
  expect(out.meta).toEqual({ resource: 'ticket' });
});

it('keeps the first rows in order and says how many were left out', () => {
  const out = JSON.parse(renderResponse(bigPage()));
  expect(out.truncated).toBe(true);
  expect(out.total_items_in_page).toBe(100);
  expect(out.returned_items).toBe(out.data.length);
  expect(out.data.length).toBeGreaterThan(0);
  expect(out.data.length).toBeLessThan(100);
  expect(out.data).toEqual(bigPage().data.slice(0, out.data.length));
  expect(out.truncation_hint).toMatch(/smaller limit/);
});

it('fits as many rows as the cap allows', () => {
  const out = JSON.parse(renderResponse(bigPage()));
  const oneMore = { ...out, data: bigPage().data.slice(0, out.data.length + 1) };
  expect(Buffer.byteLength(JSON.stringify(oneMore))).toBeGreaterThan(MAX_RESPONSE_BYTES);
});

it('leaves a page that fits untouched', () => {
  const small = bigPage(3);
  expect(renderResponse(small)).toBe(JSON.stringify(small));
});

it('redacts secrets in a shrunk page', () => {
  const page = bigPage();
  page.data[0].title = `leak ${KEY}`;
  const text = renderResponse(page, [KEY]);
  expect(text).not.toContain(KEY);
  expect(JSON.parse(text).data[0].title).toBe('leak [REDACTED]');
});

it('shrinks a hostile page of many empty rows quickly', () => {
  const start = Date.now();
  const out = JSON.parse(renderResponse({ data: Array(350_000).fill({}), pagination }));
  expect(out.pagination).toEqual(pagination);
  expect(out.returned_items).toBeLessThan(350_000);
  expect(Date.now() - start).toBeLessThan(2000);
});

it('still cuts a response that is not a list page as text', () => {
  const text = renderResponse({ data: 'x'.repeat(MAX_RESPONSE_BYTES * 2) });
  expect(text).toContain('[TRUNCATED:');
});

// The hint must name a request the tool accepts, or the model cannot reach the rows left out.
it('tells a paginated tool to repeat with a smaller limit', async () => {
  const out = await truncated('alga_tickets_list', {}, bigPage());
  expect(out.truncation_hint).toContain(`smaller limit (at most ${out.returned_items})`);
  expect(() =>
    validateArgs(tool('alga_tickets_list'), { limit: out.returned_items }),
  ).not.toThrow();
});

it('tells an offset tool to continue from offset + returned_items', async () => {
  const out = await truncated('alga_tickets_comments_list', { id: 't1', offset: 10 }, bigPage());
  const next = 10 + out.returned_items;
  expect(out.truncation_hint).toContain(`offset=${next}`);
  expect(out.truncation_hint).not.toMatch(/smaller limit|next page/);
  const args = { id: 't1', offset: next };
  expect(() => validateArgs(tool('alga_tickets_comments_list'), args)).not.toThrow();
});

it.each([
  ['alga_projects_phases_list', { project_id: 'p1' }],
  ['alga_projects_tasks_list', { project_id: 'p1' }],
  ['alga_invoices_items_list', { id: 'i1' }],
  ['alga_tickets_search', { query: 'printer' }],
])('tells %s, which has no paging, to narrow the request', async (name, args) => {
  const out = await truncated(name, args, bigPage());
  expect(out.truncation_hint).toMatch(/narrow/);
  expect(out.truncation_hint).not.toMatch(/limit|offset|next page/);
});

it('shrinks alga_search results and keeps the cursor, groups and total', async () => {
  const results = Array.from({ length: 100 }, (_, i) => ({
    id: `r-${i}`,
    snippet: 'x'.repeat(2000),
  }));
  const reply = {
    data: { results, groups: { ticket: 100 }, totalCount: 340, nextCursor: 'c-100' },
  };
  const out = await truncated('alga_search', { query: 'printer', limit: 100 }, reply);
  expect(out.data.nextCursor).toBe('c-100');
  expect(out.data.groups).toEqual({ ticket: 100 });
  expect(out.data.totalCount).toBe(340);
  expect(out.data.results).toEqual(results.slice(0, out.returned_items));
  expect(out.returned_items).toBeGreaterThan(0);
  expect(out.total_items_in_page).toBe(100);
  // The cursor points after the full page, so the way on is a smaller limit, not the cursor.
  expect(out.truncation_hint).toContain(`smaller limit (at most ${out.returned_items})`);
});

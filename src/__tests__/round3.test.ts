// Third review round: upstream memory bounds, per-route sort/fields, offset paging
// for ticket categories, the comments limit, Retry-After and SSRF name checks.
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
import {
  requestAlga,
  AlgaApiError,
  AlgaRateLimitError,
  MAX_CONCURRENT_ALGA_REQUESTS,
  MAX_UPSTREAM_RESPONSE_BYTES,
} from '../alga-client.js';
import { executeTool, MAX_RESPONSE_BYTES, ToolArgumentError } from '../executor.js';
import { ALL_TOOLS } from '../tools/index.js';
import { parseInstanceUrl, isDisallowedAddress } from '../ssrf.js';
import { json, KEY } from './helpers.js';

const creds = { instanceUrl: 'https://psa.example.com', apiKey: KEY };
const tool = (name: string) => ALL_TOOLS.find((t) => t.name === name)!;
const sentQuery = () =>
  Object.fromEntries(new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams);

beforeEach(() => {
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  vi.mocked(fetch).mockImplementation(async () => json({ data: [] }) as never);
});
afterEach(() => vi.restoreAllMocks());

it('buffers at most 1 MiB from Alga', () => {
  expect(MAX_UPSTREAM_RESPONSE_BYTES).toBe(1024 * 1024);
});

it('turns a hostile maximum-size array of empty objects into a capped, truncated result', async () => {
  const items = Math.floor((MAX_UPSTREAM_RESPONSE_BYTES - 2) / 3);
  const body = `[${Array(items).fill('{}').join(',')}]`;
  expect(Buffer.byteLength(body)).toBeLessThanOrEqual(MAX_UPSTREAM_RESPONSE_BYTES);
  vi.mocked(fetch).mockImplementation(async () => new Response(body, { status: 200 }) as never);
  const text = await executeTool(tool('alga_users_list'), {}, creds);
  expect(Buffer.byteLength(text)).toBeLessThan(MAX_RESPONSE_BYTES + 200);
  expect(text).toContain('[TRUNCATED: use narrower filters or a smaller limit.]');
  expect(text).not.toContain('fields');
});

it('fails fast with a retryable error when too many Alga calls are in flight', async () => {
  const release: (() => void)[] = [];
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => release.push(() => resolve(json({ data: [] }) as never))) as never,
  );
  const running = Array.from({ length: MAX_CONCURRENT_ALGA_REQUESTS }, () =>
    requestAlga(creds, '/clients'),
  );
  await vi.waitFor(() => expect(release).toHaveLength(MAX_CONCURRENT_ALGA_REQUESTS));
  const error = await requestAlga(creds, '/clients').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AlgaApiError);
  expect((error as Error).message).toMatch(/Try again in a few seconds/);
  expect(fetch).toHaveBeenCalledTimes(MAX_CONCURRENT_ALGA_REQUESTS);
  release.forEach((done) => done());
  await Promise.all(running);
  // Finished calls free their slots.
  vi.mocked(fetch).mockImplementation(async () => json({ data: [] }) as never);
  await expect(requestAlga(creds, '/clients')).resolves.toEqual({ data: [] });
});

it('returns a 429 at once when Retry-After is longer than the client will wait', async () => {
  const sleep = vi.fn(async () => {});
  vi.mocked(fetch).mockImplementation(async () => json({}, 429, { 'retry-after': '6' }) as never);
  await expect(requestAlga(creds, '/clients', {}, { sleep })).rejects.toBeInstanceOf(
    AlgaRateLimitError,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

it('pages ticket categories by offset, because CategoryService never reads page', async () => {
  await executeTool(tool('alga_ticket_categories_list'), { page: 2, limit: 25 }, creds);
  expect(sentQuery()).toEqual({ page: '2', limit: '25', offset: '25' });
});

it('sorts ticket categories with sort_by and sort_order, the keys CategoryService reads', async () => {
  const props = tool('alga_ticket_categories_list').inputSchema.properties;
  expect(props).not.toHaveProperty('sort');
  expect(props).not.toHaveProperty('order');
  await executeTool(
    tool('alga_ticket_categories_list'),
    { sort_by: 'created_at', sort_order: 'desc' },
    creds,
  );
  expect(sentQuery()).toMatchObject({ sort_by: 'created_at', sort_order: 'desc', offset: '0' });
});

it.each([150, 200])('sends a comments limit of %i unchanged', async (limit) => {
  await executeTool(tool('alga_tickets_comments_list'), { id: 't1', limit, offset: 0 }, creds);
  expect(sentQuery()).toEqual({ limit: String(limit), offset: '0' });
});

it('offers fields only on alga_tickets_list among list tools, as an allowlist', async () => {
  const withFields = ALL_TOOLS.filter(
    (t) => t.paginated && Object.hasOwn(t.inputSchema.properties, 'fields'),
  ).map((t) => t.name);
  expect(withFields).toEqual(['alga_tickets_list']);
  await expect(
    executeTool(tool('alga_tickets_list'), { fields: 'ticket_id,hashed_password' }, creds),
  ).rejects.toBeInstanceOf(ToolArgumentError);
  await expect(
    executeTool(tool('alga_users_list'), { fields: 'user_id,hashed_password' }, creds),
  ).rejects.toBeInstanceOf(ToolArgumentError);
  expect(fetch).not.toHaveBeenCalled();
});

it('offers sort only as an enum of real columns', async () => {
  for (const t of ALL_TOOLS) {
    const sort = t.inputSchema.properties.sort;
    if (sort) expect(sort.enum, `${t.name}.sort`).toBeDefined();
  }
  await expect(
    executeTool(tool('alga_users_list'), { sort: 'hashed_password' }, creds),
  ).rejects.toBeInstanceOf(ToolArgumentError);
});

it('describes alga_contracts_list as client contracts, not templates', () => {
  const { description } = tool('alga_contracts_list');
  expect(description).toMatch(/client contracts/);
  expect(description).toMatch(/templates are not included/);
});

it.each([
  'https://foo.home.arpa',
  'https://psa.test',
  'https://psa.invalid',
  'https://psa.example',
  'https://168.63.129.16',
])('refuses %s before any DNS lookup', (value) => {
  expect(() => parseInstanceUrl(value, false)).toThrow('The Alga instance URL');
});

it('treats the Azure platform address as disallowed', () => {
  expect(isDisallowedAddress('168.63.129.16')).toBe(true);
});

it('release.yml has no workflow_dispatch trigger, matching the template', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  expect(workflow).not.toContain('workflow_dispatch');
});

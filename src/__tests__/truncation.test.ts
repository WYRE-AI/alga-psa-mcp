// Pagination-safe truncation: an oversized list page drops rows from the end of
// data and keeps every other top-level field, so the model can still page on.
import { it, expect } from 'vitest';
import { MAX_RESPONSE_BYTES, renderResponse } from '../executor.js';
import { KEY } from './helpers.js';

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

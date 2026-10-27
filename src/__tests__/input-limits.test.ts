import { it, expect } from 'vitest';
import { countToolInputElements, MAX_TOOL_INPUT_ELEMENTS, toolInputTooLarge, toolInputTooLargeResult } from '../input-limits.js';
import { ALL_TOOLS } from '../tools/index.js';
import { validateArgs } from '../executor.js';
const get = ALL_TOOLS.find((t) => t.name === 'alga_tickets_get')!;
const list = ALL_TOOLS.find((t) => t.name === 'alga_tickets_list')!;
it('counts nested keys and array elements', () => {
  expect(countToolInputElements({ a: { b: [1, { c: 1 }] } }, 100)).toBe(5);
  expect(toolInputTooLarge(Array(MAX_TOOL_INPUT_ELEMENTS).fill(0))).toBe(false);
  expect(toolInputTooLarge(Array(MAX_TOOL_INPUT_ELEMENTS + 1).fill(0))).toBe(true);
  expect(toolInputTooLarge(undefined)).toBe(false);
  expect(toolInputTooLargeResult('tool').isError).toBe(true);
});
it('does not recurse on deeply nested input and exits early', () => {
  let deep: unknown = 0;
  for (let n = 0; n < 200000; n++) deep = [deep];
  expect(countToolInputElements(deep, 1000000)).toBe(200000);
  expect(countToolInputElements(Array(1000000).fill(0), 10)).toBe(1000000);
});
it.each(['.', '..', '../x', 'x/y', 'x?y', 'x#y', 'x y', '', 'x'.repeat(129), 12, null])('rejects unsafe identifier %s', (id) => expect(() => validateArgs(get, { id })).toThrow());
it.each(['abc-123_foo:bar.baz', 'A', 'x'.repeat(128)])('allows string identifier %s', (id) => expect(() => validateArgs(get, { id })).not.toThrow());
it.each([{ limit: 101 }, { limit: 0 }, { page: 0 }, { page: 101 }, { limit: '5' }, { limit: 1.5 }, { is_open: 'true' }, { fields: {} }, { order: 'up' }, { sort: 'x'.repeat(129) }])('enforces schema value limits %j', (args) => expect(() => validateArgs(list, args)).toThrow());
it('rejects unbounded arrays and invalid array identifiers', () => {
  const schedule = ALL_TOOLS.find((t) => t.name === 'alga_schedules_create')!;
  const base = { title: 'Visit', scheduled_start: 'start', scheduled_end: 'end' };
  for (const assigned_user_ids of [Array(101).fill('u1'), ['../bad'], [1]]) expect(() => validateArgs(schedule, { ...base, assigned_user_ids })).toThrow();
});
it('requires path identifiers and create fields', () => {
  for (const tool of ALL_TOOLS) if (tool.inputSchema.required.length) expect(() => validateArgs(tool, {})).toThrow('required');
});

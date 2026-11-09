import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
import { requestAlga, apiFailure, validateTenantId } from '../alga-client.js';
import { executeTool } from '../executor.js';
import { ALL_TOOLS } from '../tools/index.js';
import { parseInstanceUrl } from '../ssrf.js';
import { json, KEY } from './helpers.js';
const creds = { instanceUrl: 'https://psa.example.com', apiKey: KEY };
const tool = (name: string) => ALL_TOOLS.find((t) => t.name === name)!;
beforeEach(() => {
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  vi.mocked(fetch).mockResolvedValue(json({ data: [] }) as never);
});
afterEach(() => {
  vi.restoreAllMocks();
});
it.each(['', '/', '/api/v1', '/api/v1/'])(
  'normalizes supported suffix %s and appends API prefix once',
  async (suffix) => {
    expect(parseInstanceUrl(creds.instanceUrl + suffix).href).toBe(creds.instanceUrl + '/');
    await requestAlga({ ...creds, instanceUrl: creds.instanceUrl + suffix }, '/clients');
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(creds.instanceUrl + '/api/v1/clients');
  },
);
it.each(['/api', '/api/v1/clients', '/other/', '/api/v1?x=1'])(
  'rejects unsupported suffix %s',
  (suffix) => {
    expect(() => parseInstanceUrl(creds.instanceUrl + suffix)).toThrow('Use the https://');
  },
);
it('validates optional tenant IDs without accepting arbitrary strings', () => {
  expect(validateTenantId('')).toBeUndefined();
  expect(validateTenantId('  ')).toBeUndefined();
  expect(validateTenantId('12345678-1234-1234-1234-123456789abc')).toBeDefined();
  expect(() => validateTenantId('tenant')).toThrow('Leave it blank');
});
it('gives safe retry guidance on network failures', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error(KEY));
  await expect(requestAlga(creds, '/clients')).rejects.toThrow('Try again shortly.');
});
it.each([400, 401, 403, 404, 409, 422, 429, 500, 503, 302])(
  'provides a next step for HTTP %s',
  (status) => {
    expect(apiFailure(status).message).toMatch(/Check|Ask|Get|Wait|Try/);
  },
);
it.each([500, 502, 503, 504])('keeps the server-problem message for HTTP %s', (status) => {
  expect(apiFailure(status).message).toBe(
    `Alga is having a server problem. Try again shortly; if it keeps failing, contact Alga support. (HTTP ${status}).`,
  );
});
const mapping = (
  id: string,
  phase_id: string | null,
  display_order: number,
  is_closed = false,
) => ({ project_status_mapping_id: id, phase_id, display_order, is_closed });
it('filters mapping lookup to the effective phase scope without forwarding phase_id', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    json({ data: [mapping('global', null, 0), mapping('local', 'phase', 1)] }) as never,
  );
  const result = await executeTool(
    tool('alga_projects_task_status_mappings_list'),
    { project_id: 'project', phase_id: 'phase' },
    creds,
  );
  expect(
    JSON.parse(result).data.map(
      (m: { project_status_mapping_id: string }) => m.project_status_mapping_id,
    ),
  ).toEqual(['local']);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain('?');
});
it.each([
  [
    [mapping('global', null, 0), mapping('later', 'phase', 8), mapping('first', 'phase', 2)],
    ['first', 'later'],
  ],
  [[mapping('global', null, 0), mapping('other', 'other', 1)], ['global']],
] as const)('falls back to project-wide statuses in display order', async (mappings, ids) => {
  vi.mocked(fetch).mockResolvedValueOnce(json({ data: mappings }) as never);
  const result = await executeTool(
    tool('alga_projects_task_status_mappings_list'),
    { project_id: 'project', phase_id: 'phase' },
    creds,
  );
  expect(
    JSON.parse(result).data.map(
      (m: { project_status_mapping_id: string }) => m.project_status_mapping_id,
    ),
  ).toEqual(ids);
});
it('uses the phase task list path without pagination', async () => {
  await executeTool(
    tool('alga_projects_tasks_list'),
    { project_id: 'project', phase_id: 'phase' },
    creds,
  );
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
    creds.instanceUrl + '/api/v1/projects/project/phases/phase/tasks',
  );
});

it('lists phases without pagination and preserves the data-only response', async () => {
  const phasesTool = tool('alga_projects_phases_list');
  expect(phasesTool.paginated).toBe(false);
  expect(Object.keys(phasesTool.inputSchema.properties)).toEqual(['project_id']);
  expect(phasesTool.inputSchema.required).toEqual(['project_id']);
  const response = { data: [{ phase_id: 'phase' }] };
  vi.mocked(fetch).mockResolvedValueOnce(json(response) as never);
  const result = await executeTool(phasesTool, { project_id: 'project' }, creds);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
    creds.instanceUrl + '/api/v1/projects/project/phases',
  );
  expect(JSON.parse(result)).toEqual(response);
});

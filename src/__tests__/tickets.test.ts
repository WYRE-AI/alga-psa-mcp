import { expect, it } from 'vitest';
import { ALL_TOOLS } from '../tools/index.js';
import { routeTests } from './helpers.js';

// TicketService.getTicketComments hides internal comments and threads from client-portal users.
it('does not promise internal notes to every API key', () => {
  const tool = ALL_TOOLS.find((t) => t.name === 'alga_tickets_comments_list')!;
  expect(tool.description).toMatch(/internal notes are included for internal users/i);
  expect(tool.description).toContain('is_internal');
});

routeTests([
  [
    'alga_tickets_list',
    'GET',
    '/tickets',
    {
      client_id: 'c1',
      is_open: true,
      limit: 5,
      fields: 'ticket_id,title',
      order: 'desc',
      sort: 'entered_at',
    },
    {
      page: 1,
      limit: 5,
      client_id: 'c1',
      is_open: true,
      fields: 'ticket_id,title',
      order: 'desc',
      sort: 'entered_at',
    },
  ],
  ['alga_tickets_get', 'GET', '/tickets/t1', { id: 't1' }],
  [
    'alga_tickets_search',
    'GET',
    '/tickets/search',
    { query: 'router', client_ids: 'c1,c2', include_closed: true, fields: 'title,ticket_number' },
    { query: 'router', client_ids: 'c1,c2', include_closed: true, fields: 'title,ticket_number' },
  ],
  [
    'alga_tickets_comments_list',
    'GET',
    '/tickets/t1/comments',
    { id: 't1', limit: 50, offset: 50, order: 'asc', content_format: 'markdown' },
    { limit: 50, offset: 50, order: 'asc', content_format: 'markdown' },
  ],
  ['alga_tickets_time_entries_list', 'GET', '/tickets/t1/time-entries', { id: 't1' }],
  ['alga_tickets_assets_list', 'GET', '/tickets/t1/assets', { id: 't1' }],
  [
    'alga_tickets_get_by_external_link',
    'GET',
    '/tickets/by-external-link',
    { system: 'github', external_id: 'org/repo#42', external_parent_id: 'org/repo' },
    { system: 'github', external_id: 'org/repo#42', external_parent_id: 'org/repo' },
  ],
]);

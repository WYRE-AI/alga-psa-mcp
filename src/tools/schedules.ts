import { tool, id, type Field } from './shared.js';
const when: Field = {
  type: 'string',
  maxLength: 40,
  description: 'YYYY-MM-DD or an ISO 8601 date-time with offset.',
};
export const schedules = [
  // GET /schedules returns every entry at once; /schedules/search is the paginated twin.
  tool(
    'alga_schedules_list',
    'List schedule entries, one page at a time. Filter by user or date range.',
    '/schedules/search',
    { user_id: id, start_date: when, end_date: when },
    [],
    true,
  ),
];

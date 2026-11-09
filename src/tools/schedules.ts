import { tool, id, str } from './shared.js';
export const schedules = [
  tool(
    'alga_schedules_list',
    'List schedule entries, one page at a time. Use to browse or filter by user, work item or date range.',
    '/schedules',
    { user_id: id, work_item_id: id, start_date: str, end_date: str },
    [],
    true,
  ),
];

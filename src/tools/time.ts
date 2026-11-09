import { tool, id, str, bool } from './shared.js';
export const time = [
  tool(
    'alga_time_entries_list',
    'List time entries, one page at a time. Use to browse or filter by user, work item, dates or billable state.',
    '/time-entries',
    {
      user_id: id,
      work_item_id: id,
      work_item_type: str,
      date_from: str,
      date_to: str,
      start_time_from: str,
      start_time_to: str,
      end_time_from: str,
      end_time_to: str,
      service_id: id,
      approval_status: str,
      is_billable: bool,
    },
    [],
    true,
  ),
  tool(
    'alga_time_entries_get',
    'Get one time entry by ID. Use after a list or search to see full details.',
    '/time-entries/{id}',
    { id },
    ['id'],
  ),
  tool(
    'alga_time_sheets_list',
    'List time sheets, one page at a time. Use to browse or filter by user, period or approval state.',
    '/time-sheets',
    { user_id: id, period_id: id, approval_status: str },
    [],
    true,
  ),
];

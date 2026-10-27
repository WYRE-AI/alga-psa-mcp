import { tool, id, str, text, bool, ids } from './shared.js';
export const schedules = [
  tool('alga_schedules_list', 'List schedule entries, one page at a time. Use to browse or filter by user, work item or date range.', 'GET', '/schedules', 'read', { user_id: id, work_item_id: id, start_date: str, end_date: str }, [], true),
  tool('alga_schedules_create', 'Create and return a schedule entry with start/end times and optional assigned users.', 'POST', '/schedules', 'write', { title: str, scheduled_start: str, scheduled_end: str, work_item_id: id, work_item_type: str, assigned_user_ids: ids, calendar_id: id, notes: text, is_private: bool, is_all_day: bool }, ['title', 'scheduled_start', 'scheduled_end']),
  tool('alga_schedules_delete', '⚠ DESTRUCTIVE: Delete a schedule entry permanently.', 'DELETE', '/schedules/{id}', 'destructive', { id }, ['id']),
];

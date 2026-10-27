import { tool, id, str, text, bool } from './shared.js';
const entryFields = { work_item_id: id, work_item_type: str, start_time: str, end_time: str, notes: text, service_id: id, contract_line_id: id, tax_rate_id: id, is_billable: bool };
export const time = [
  tool('alga_time_entries_list', 'Return a page of time entries; filter by user, work item, dates or billable state.', 'GET', '/time-entries', 'read', { user_id: id, work_item_id: id, work_item_type: str, start_date: str, end_date: str, is_billable: bool }, [], true),
  tool('alga_time_entries_get', 'Return one time entry by ID.', 'GET', '/time-entries/{id}', 'read', { id }, ['id']),
  tool('alga_time_sheets_list', 'Return a page of time sheets; filter by user, period or approval state.', 'GET', '/time-sheets', 'read', { user_id: id, period_id: id, approval_status: str }, [], true),
  tool('alga_time_entries_create', 'Create and return a time entry for a work item, service and time interval.', 'POST', '/time-entries', 'write', entryFields, ['work_item_type', 'start_time', 'end_time', 'service_id']),
  tool('alga_time_entries_update', 'Update explicit time entry fields and return the entry.', 'PUT', '/time-entries/{id}', 'write', { id, ...entryFields }, ['id']),
  tool('alga_time_entries_delete', '⚠ DESTRUCTIVE: Delete a time entry by ID; return the deletion result.', 'DELETE', '/time-entries/{id}', 'destructive', { id }, ['id']),
  tool('alga_time_sheets_approve', '⚠ DESTRUCTIVE: Approve a time sheet for billing/payroll; return the approval result.', 'POST', '/time-sheets/{id}/approve', 'destructive', { id }, ['id']),
];

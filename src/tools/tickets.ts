import { tool, id, str, text, bool, num } from './shared.js';
const filters = { board_id: id, client_id: id, status_id: id, priority_id: id, assigned_to: id, is_open: bool, is_closed: bool, entered_from: str, entered_to: str, closed_from: str, closed_to: str, external_system: str, external_id: id, search: str };
const ticketFields = { title: str, summary: text, url: str, client_id: id, board_id: id, priority_id: id, status_id: id, severity_id: id, urgency_id: id, impact_id: id };
export const tickets = [
  tool('alga_tickets_list', "List tickets, one page at a time. Use to browse or filter by client, board, status, priority, assignee, open or closed, dates or external link.", 'GET', '/tickets', 'read', filters, [], true),
  tool('alga_tickets_get', 'Get one ticket by ID. Use after a list or search to see full details.', 'GET', '/tickets/{id}', 'read', { id }, ['id']),
  tool('alga_tickets_search', "Search tickets by text and return matches. Use when you have words from the title or description; add filters to narrow by client, board, status or assignee.", 'GET', '/tickets/search', 'read', { ...filters, query: str }, ['query'], true),
  tool('alga_tickets_comments_list', "List comments on a ticket, one page at a time. Set is_internal to true for internal notes only, or false for client-visible comments only.", 'GET', '/tickets/{id}/comments', 'read', { id, is_internal: bool }, ['id'], true),
  tool('alga_tickets_time_entries_list', 'List time entries linked to a ticket, one page at a time.', 'GET', '/tickets/{id}/time-entries', 'read', { id }, ['id'], true),
  tool('alga_tickets_assets_list', 'List assets linked to a ticket, one page at a time.', 'GET', '/tickets/{id}/assets', 'read', { id }, ['id'], true),
  tool('alga_tickets_get_by_external_link', "Get the ticket linked to a record in another system, using that system's name and the record's ID there.", 'GET', '/tickets/by-external-link', 'read', { system: str, external_id: id, external_parent_id: id }, ['system', 'external_id']),
  tool('alga_tickets_create', "Create a ticket and return it. Needs a title plus client, board, status and priority IDs; get them from alga_clients_list, alga_boards_list, alga_statuses_list and alga_priorities_list.", 'POST', '/tickets', 'write', ticketFields, ['title', 'client_id', 'board_id', 'status_id', 'priority_id']),
  tool('alga_tickets_update', 'Update a ticket and return it. Pass the ticket ID and only the fields you want to change.', 'PUT', '/tickets/{id}', 'write', { id, ...ticketFields }, ['id']),
  tool('alga_tickets_update_status', "Update a ticket's status and return the ticket. Get status IDs from alga_statuses_list.", 'PUT', '/tickets/{id}/status', 'write', { id, status_id: id }, ['id', 'status_id']),
  tool('alga_tickets_update_assignment', "Update a ticket's primary assignee and return the ticket. Get user IDs from alga_users_list.", 'PUT', '/tickets/{id}/assignment', 'write', { id, assigned_to: id }, ['id', 'assigned_to']),
  tool('alga_tickets_comments_create', "Create a comment or internal note on a ticket and return it. Set is_internal to true to hide it from the client.", 'POST', '/tickets/{id}/comments', 'write', { id, comment_text: { ...text, minLength: 1 }, is_internal: bool, is_resolution: bool, time_spent: num, parent_comment_id: id }, ['id', 'comment_text']),
  tool('alga_tickets_checklist_create', "Create a checklist item on a ticket and return it.", 'POST', '/tickets/{id}/checklist', 'write', { id, item_name: str, description: text, is_required: bool }, ['id', 'item_name']),
  tool('alga_tickets_delete', '⚠ DESTRUCTIVE: Delete a ticket permanently.', 'DELETE', '/tickets/{id}', 'destructive', { id }, ['id']),
];

import { tool, id, str, text, bool } from './shared.js';
const filters = { board_id: id, client_id: id, status_id: id, priority_id: id, assigned_to: id, is_open: bool, is_closed: bool, entered_from: str, entered_to: str, closed_from: str, closed_to: str, external_system: str, external_id: str, search: str };
const ticketFields = { title: str, summary: text, url: str, client_id: id, board_id: id, priority_id: id, status_id: id, severity_id: id, urgency_id: id, impact_id: id };
export const tickets = [
  tool('alga_tickets_list', 'Return a page of tickets; filter by client, board, status, assignee, dates or external link.', 'GET', '/tickets', 'read', filters, [], true),
  tool('alga_tickets_get', 'Return one ticket by ID.', 'GET', '/tickets/{id}', 'read', { id }, ['id']),
  tool('alga_tickets_search', 'Return matching tickets by query; narrow by client, board, status or assignee.', 'GET', '/tickets/search', 'read', { ...filters, query: str }, ['query'], true),
  tool('alga_tickets_comments_list', 'Return ticket comments; optionally filter internal notes.', 'GET', '/tickets/{id}/comments', 'read', { id, is_internal: bool }, ['id'], true),
  tool('alga_tickets_time_entries_list', 'Return a page of time entries linked to a ticket.', 'GET', '/tickets/{id}/time-entries', 'read', { id }, ['id'], true),
  tool('alga_tickets_assets_list', 'Return a page of assets linked to a ticket.', 'GET', '/tickets/{id}/assets', 'read', { id }, ['id'], true),
  tool('alga_tickets_find_by_external_link', 'Return the ticket matching an external system and external ID.', 'GET', '/tickets/by-external-link', 'read', { system: str, external_id: str, external_parent_id: str }, ['system', 'external_id']),
  tool('alga_tickets_create', 'Create and return a ticket with client, board, priority and status references.', 'POST', '/tickets', 'write', ticketFields, ['title', 'client_id', 'board_id', 'status_id', 'priority_id']),
  tool('alga_tickets_update', 'Update explicit ticket fields and return the ticket.', 'PUT', '/tickets/{id}', 'write', { id, ...ticketFields }, ['id']),
  tool('alga_tickets_update_status', 'Set a ticket status and return the updated ticket.', 'PUT', '/tickets/{id}/status', 'write', { id, status_id: id }, ['id', 'status_id']),
  tool('alga_tickets_update_assignment', 'Set the primary ticket assignee and return the updated ticket.', 'PUT', '/tickets/{id}/assignment', 'write', { id, assigned_to: id }, ['id', 'assigned_to']),
  tool('alga_tickets_comments_add', 'Add a ticket comment or internal note and return the comment.', 'POST', '/tickets/{id}/comments', 'write', { id, comment_text: text, is_internal: bool, is_resolution: bool }, ['id', 'comment_text']),
  tool('alga_tickets_checklist_add', 'Add a named checklist item to a ticket and return the item.', 'POST', '/tickets/{id}/checklist', 'write', { id, item_name: str, description: text, is_required: bool }, ['id', 'item_name']),
  tool('alga_tickets_delete', '⚠ DESTRUCTIVE: Delete a ticket by ID; return the deletion result.', 'DELETE', '/tickets/{id}', 'destructive', { id }, ['id']),
];

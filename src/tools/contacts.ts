import { tool, id, str, text, bool } from './shared.js';
const filters = { client_id: id, search: str, is_inactive: bool };
const contactFields = { full_name: str, email: str, client_id: id, role: str, notes: text, is_inactive: bool };
export const contacts = [
  tool('alga_contacts_list', 'Return a page of contacts; filter by client, search or inactive state.', 'GET', '/contacts', 'read', filters, [], true),
  tool('alga_contacts_get', 'Return one contact by ID.', 'GET', '/contacts/{id}', 'read', { id }, ['id']),
  tool('alga_contacts_search', 'Return contacts matching a query, optionally within a client.', 'GET', '/contacts/search', 'read', { query: str, client_id: id, include_inactive: bool }, ['query'], true),
  tool('alga_contacts_create', 'Create and return a contact with a full name and email.', 'POST', '/contacts', 'write', contactFields, ['full_name', 'email']),
  tool('alga_contacts_update', 'Update explicit contact fields and return the contact.', 'PUT', '/contacts/{id}', 'write', { id, ...contactFields }, ['id']),
  tool('alga_contacts_delete', '⚠ DESTRUCTIVE: Delete a contact by ID; return the deletion result.', 'DELETE', '/contacts/{id}', 'destructive', { id }, ['id']),
];

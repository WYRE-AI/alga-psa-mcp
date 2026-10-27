import { tool, id, str, text, bool } from './shared.js';
const clientFields = { client_name: str, billing_cycle: str, phone_no: str, email: str, url: str, address: str, client_type: str, notes: text, is_inactive: bool };
export const clients = [
  tool('alga_clients_list', 'List clients, one page at a time. Use to browse or filter by name search, type or inactive state.', 'GET', '/clients', 'read', { search: str, client_type: str, is_inactive: bool }, [], true),
  tool('alga_clients_get', 'Get one client by ID. Use after a list or search to see full details.', 'GET', '/clients/{id}', 'read', { id }, ['id']),
  tool('alga_clients_locations_list', 'List locations belonging to a client, one page at a time.', 'GET', '/clients/{id}/locations', 'read', { id }, ['id'], true),
  tool('alga_clients_contacts_list', "List contacts belonging to one client, one page at a time. Use alga_contacts_list to browse across clients or alga_contacts_search to find a person by name or email.", 'GET', '/clients/{id}/contacts', 'read', { id }, ['id'], true),
  tool('alga_clients_create', 'Create and return a client with a name and billing cycle.', 'POST', '/clients', 'write', clientFields, ['client_name', 'billing_cycle']),
  tool('alga_clients_update', 'Update a client and return it. Pass the client ID and only the fields you want to change.', 'PUT', '/clients/{id}', 'write', { id, ...clientFields }, ['id']),
  tool('alga_clients_delete', '⚠ DESTRUCTIVE: Delete a client permanently.', 'DELETE', '/clients/{id}', 'destructive', { id }, ['id']),
  tool('alga_clients_merge', "⚠ DESTRUCTIVE: Merge another client into this one. Everything on source_client_id (billing profile, contacts, tickets and other records) moves to the client in id, and source_client_id is marked as merged. This can't be undone.", 'POST', '/clients/{id}/merge', 'destructive', { id, source_client_id: id, pin_portal_grants: bool }, ['id', 'source_client_id']),
];

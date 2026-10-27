import { tool, id, str, text, bool } from './shared.js';
const clientFields = { client_name: str, billing_cycle: str, phone_no: str, email: str, url: str, address: str, client_type: str, notes: text, is_inactive: bool };
export const clients = [
  tool('alga_clients_list', 'Return a page of clients; filter by name search, type or inactive state.', 'GET', '/clients', 'read', { search: str, client_type: str, is_inactive: bool }, [], true),
  tool('alga_clients_get', 'Return one client by ID.', 'GET', '/clients/{id}', 'read', { id }, ['id']),
  tool('alga_clients_locations_list', 'Return a page of locations belonging to a client.', 'GET', '/clients/{id}/locations', 'read', { id }, ['id'], true),
  tool('alga_clients_contacts_list', 'Return a page of contacts belonging to a client.', 'GET', '/clients/{id}/contacts', 'read', { id }, ['id'], true),
  tool('alga_clients_create', 'Create and return a client with a name and billing cycle.', 'POST', '/clients', 'write', clientFields, ['client_name', 'billing_cycle']),
  tool('alga_clients_update', 'Update explicit client profile fields and return the client.', 'PUT', '/clients/{id}', 'write', { id, ...clientFields }, ['id']),
  tool('alga_clients_delete', '⚠ DESTRUCTIVE: Delete a client by ID; return the deletion result.', 'DELETE', '/clients/{id}', 'destructive', { id }, ['id']),
  tool('alga_clients_merge', '⚠ DESTRUCTIVE: Permanently absorb source client id into target_client_id; return the merge result.', 'POST', '/clients/{id}/merge', 'destructive', { id, target_client_id: id }, ['id', 'target_client_id']),
];

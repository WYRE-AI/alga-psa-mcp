import { tool, id, str, bool, baseList, enumOf } from './shared.js';
export const clients = [
  tool(
    'alga_clients_list',
    'List clients, one page at a time. Use to browse or filter by name search, type or inactive state.',
    '/clients',
    { ...baseList, search: str, client_type: enumOf('company', 'individual'), is_inactive: bool },
    [],
    true,
  ),
  tool(
    'alga_clients_get',
    'Get one client by ID. Use after a list or search to see full details.',
    '/clients/{id}',
    { id },
    ['id'],
  ),
  tool(
    'alga_clients_locations_list',
    'List all locations belonging to a client (not paginated).',
    '/clients/{id}/locations',
    { id },
    ['id'],
  ),
  tool(
    'alga_clients_contacts_list',
    'List contacts belonging to one client, one page at a time. Use alga_contacts_list to browse across clients or alga_contacts_search to find a person by name or email.',
    '/clients/{id}/contacts',
    { id, search: str, is_inactive: bool },
    ['id'],
    true,
  ),
];

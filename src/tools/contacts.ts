import { tool, id, str, bool } from './shared.js';
export const contacts = [
  tool(
    'alga_contacts_list',
    'List contacts, one page at a time. Use to browse or filter by client or inactive state; use alga_contacts_search to find a person by name or email.',
    '/contacts',
    { client_id: id, search: str, is_inactive: bool },
    [],
    true,
  ),
  tool(
    'alga_contacts_get',
    'Get one contact by ID. Use after a list or search to see full details.',
    '/contacts/{id}',
    { id },
    ['id'],
  ),
  tool(
    'alga_contacts_search',
    'Search contacts by name or email and return matches. Optionally limit to one client or include inactive contacts.',
    '/contacts/search',
    { query: str, client_id: id, include_inactive: bool },
    ['query'],
    true,
  ),
];

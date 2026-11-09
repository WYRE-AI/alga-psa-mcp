import { tool, id, str, bool, limit, listOf, sortBy } from './shared.js';
export const contacts = [
  tool(
    'alga_contacts_list',
    'List contacts, one page at a time. Use to browse or filter by client or inactive state; use alga_contacts_search to find a person by name or email.',
    '/contacts',
    {
      // ContactService.list: client_name and phone_number are mapped, the rest are `c.${sort}`.
      ...sortBy('full_name', 'email', 'client_name', 'phone_number', 'created_at', 'updated_at'),
      client_id: id,
      search: str,
      is_inactive: bool,
    },
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
  // contactSearchSchema: unpaginated; fields picks the columns to match, not to return.
  tool(
    'alga_contacts_search',
    'Search contacts by name, email or other columns and return up to limit matches (not paginated). Optionally limit to one client or include inactive contacts.',
    '/contacts/search',
    {
      query: { ...str, minLength: 1 },
      fields: listOf(
        ['full_name', 'email', 'phone_number', 'role', 'notes'],
        'Comma-separated columns to match the query against (not the columns returned).',
      ),
      client_id: id,
      include_inactive: bool,
      limit: limit(100),
    },
    ['query'],
  ),
];

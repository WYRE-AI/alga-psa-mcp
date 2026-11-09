import {
  tool,
  id,
  str,
  bool,
  dateTime,
  externalId,
  idList,
  limit,
  listOf,
  order,
  enumOf,
  sortBy,
} from './shared.js';
/** TicketService TICKET_LIST_FIELD_ALLOWLIST: the only list route that reads fields. */
const TICKET_LIST_FIELDS = [
  ...['ticket_id', 'ticket_number', 'title', 'status_id', 'status_name', 'status_is_closed'],
  ...['priority_name', 'assigned_to_name', 'client_name', 'contact_name', 'updated_at'],
  ...['entered_at', 'closed_at', 'tags', 'contact_tags', 'client_tags', 'master_ticket_id'],
  ...['bundle_master_ticket_number', 'bundle_child_count', 'latest_activity_at', 'mobile_list'],
];
export const tickets = [
  tool(
    'alga_tickets_list',
    'List tickets, one page at a time. Use to browse or filter by client, board, status, priority, assignee, open or closed, dates or external link.',
    '/tickets',
    {
      // TicketService TICKET_LIST_API_SORT_SQL (created_at is its alias for entered_at).
      ...sortBy(
        ...['ticket_number', 'title', 'entered_at', 'updated_at', 'closed_at', 'due_date'],
        ...['client_name', 'status_name', 'priority_name', 'latest_activity_at'],
      ),
      fields: listOf(TICKET_LIST_FIELDS, 'Comma-separated columns to return.'),
      board_id: id,
      client_id: id,
      status_id: id,
      priority_id: id,
      assigned_to: id,
      is_open: bool,
      is_closed: bool,
      entered_from: dateTime,
      entered_to: dateTime,
      closed_from: dateTime,
      closed_to: dateTime,
      external_system: str,
      external_id: externalId,
      search: str,
    },
    [],
    true,
  ),
  tool(
    'alga_tickets_get',
    'Get one ticket by ID. Use after a list or search to see full details.',
    '/tickets/{id}',
    { id },
    ['id'],
  ),
  // ticketSearchSchema: unpaginated, closed tickets excluded unless include_closed.
  tool(
    'alga_tickets_search',
    'Search tickets by text and return up to limit matches (not paginated). Closed tickets are left out unless include_closed is true. Narrow with comma-separated client, status, priority or assignee IDs.',
    '/tickets/search',
    {
      query: { ...str, minLength: 1 },
      fields: listOf(
        ['title', 'ticket_number', 'client_name', 'contact_name'],
        'Comma-separated columns to search in.',
      ),
      client_ids: idList,
      status_ids: idList,
      priority_ids: idList,
      assigned_to_ids: idList,
      include_closed: bool,
      limit: limit(100),
    },
    ['query'],
  ),
  // getComments reads only limit, offset, order and content_format.
  tool(
    'alga_tickets_comments_list',
    "List comments on a ticket. Internal notes are included for internal users; each comment's is_internal flag says which. Use limit (up to 200) and offset to read long threads in parts.",
    '/tickets/{id}/comments',
    {
      id,
      limit: limit(200),
      offset: { type: 'integer', minimum: 0, maximum: 1_000_000 },
      order,
      content_format: enumOf('full', 'markdown'),
    },
    ['id'],
  ),
  tool(
    'alga_tickets_time_entries_list',
    "Get the time logged on a ticket (not paginated). Users who can read every time sheet see all entries; others see their own entries plus a total for everyone else's.",
    '/tickets/{id}/time-entries',
    { id },
    ['id'],
  ),
  tool(
    'alga_tickets_assets_list',
    'List all assets linked to a ticket (not paginated).',
    '/tickets/{id}/assets',
    { id },
    ['id'],
  ),
  tool(
    'alga_tickets_get_by_external_link',
    "Get the ticket linked to a record in another system, using that system's name and the record's ID there.",
    '/tickets/by-external-link',
    { system: { ...str, minLength: 1 }, external_id: externalId, external_parent_id: externalId },
    ['system', 'external_id'],
  ),
];

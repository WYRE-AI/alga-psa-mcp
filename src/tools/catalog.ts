import { tool, id, str, bool, enumOf, limit, listOf, order, sortBy } from './shared.js';
/** SEARCH_OBJECT_TYPES in Alga's packages/types/src/search.ts. */
const SEARCH_TYPES = [
  'client',
  'contact',
  'user',
  'ticket',
  'ticket_comment',
  'project',
  'project_phase',
  'project_task',
  'project_task_comment',
  'asset',
  'sales_order',
  'purchase_order',
  'stock_unit',
  'invoice',
  'invoice_item',
  'invoice_annotation',
  'contract',
  'client_contract',
  'document',
  'kb_article',
  'service_catalog',
  'service_request_submission',
  'service_request_definition',
  'workflow_task',
  'interaction',
  'schedule_entry',
  'time_entry',
  'board',
  'category',
  'tag',
  'status',
];
export const catalog = [
  tool(
    'alga_users_list',
    'List users, one page at a time. Use to browse or filter by search or inactive state.',
    '/users',
    {
      // UserService.list: BaseService.applySorting, an unqualified orderBy on users.
      ...sortBy('username', 'first_name', 'last_name', 'email', 'created_at', 'updated_at'),
      search: str,
      is_inactive: bool,
    },
    [],
    true,
  ),
  tool(
    'alga_users_get',
    'Get one user profile by ID. Use after a list or search to see full details.',
    '/users/{id}',
    { id },
    ['id'],
  ),
  tool(
    'alga_teams_list',
    'List teams of users, one page at a time. Use to browse or filter by team name, manager or whether a team has a manager.',
    '/teams',
    {
      // TeamService.list allowedSortFields.
      ...sortBy('team_name', 'manager_name', 'member_count', 'created_at', 'updated_at'),
      team_name: str,
      manager_id: id,
      has_manager: bool,
    },
    [],
    true,
  ),
  tool(
    'alga_boards_list',
    'List ticket boards, optionally filtered by name search, one page at a time. Inactive boards are left out unless include_inactive is true.',
    '/boards',
    {
      // BoardService.list validSortFields; it drops inactive boards unless include_inactive.
      ...sortBy('display_order', 'board_name', 'is_inactive', 'is_default'),
      search: str,
      include_inactive: bool,
    },
    [],
    true,
  ),
  // statusListQuerySchema: the filter is `type`, and type=ticket requires board_id.
  tool(
    'alga_statuses_list',
    'List statuses, one page at a time. Filter by type (ticket, project, project_task or interaction) or name search. Ticket statuses belong to a board, so type=ticket also needs board_id.',
    '/statuses',
    {
      // StatusService.list: an unqualified orderBy on statuses; search is an ILIKE on name.
      ...sortBy('name', 'order_number'),
      type: enumOf('ticket', 'project', 'project_task', 'interaction'),
      board_id: id,
      search: str,
    },
    [],
    true,
  ),
  tool(
    'alga_priorities_list',
    'List priorities, one page at a time. Use to browse or filter by priority name search or by what they apply to (item_type).',
    '/priorities',
    {
      // PriorityService.list: an unqualified orderBy on priorities.
      ...sortBy('priority_name', 'order_number'),
      search: str,
      item_type: enumOf('ticket', 'project_task'),
    },
    [],
    true,
  ),
  // CategoryService.listTicketCategories pages by limit+offset and sorts by
  // sort_by/sort_order; the executor turns page into offset.
  tool(
    'alga_ticket_categories_list',
    'List ticket categories, one page at a time. Use to browse or filter by board, parent category or name search.',
    '/categories/ticket',
    {
      sort_by: enumOf('category_name', 'created_at'),
      sort_order: order,
      board_id: id,
      parent_category: id,
      search: str,
    },
    [],
    true,
  ),
  tool(
    'alga_services_list',
    'List services, one page at a time. Use to browse or filter by name search or category.',
    '/services',
    {
      ...sortBy('service_name', 'billing_method', 'default_rate'),
      search: str,
      category_id: id,
    },
    [],
    true,
  ),
  // ContractLineService.listContracts: client-owned headers only (templates excluded),
  // no client or status filter, sort from its sortColumns map.
  tool(
    'alga_contracts_list',
    'List client contracts, one page at a time (each has owner_client_id and owner_client_name); templates are not included. Filter by contract name, active state or whether a contract has plans. There is no per-client filter here.',
    '/contracts',
    {
      ...sortBy('contract_name', 'billing_frequency', 'is_active', 'created_at', 'updated_at'),
      contract_name: str,
      is_active: bool,
      has_plans: bool,
    },
    [],
    true,
  ),
  tool(
    'alga_search',
    "Search across record types at once. Use when you don't know the record type; pass the returned nextCursor as cursor to get more results.",
    '/search',
    {
      query: { type: 'string', minLength: 1, maxLength: 200 },
      types: listOf(
        SEARCH_TYPES,
        'Comma-separated record types to search, for example ticket,asset.',
      ),
      cursor: str,
      limit: limit(100),
      sort: enumOf('relevance', 'recent'),
    },
    ['query'],
  ),
];

// Alga's own query contract, vendored by hand from Nine-Minds/alga-psa
// (server/src/lib/api/schemas/*.ts, the controllers that parse each route, and
// the service method each controller calls). Each tool is driven through the
// real executor with every argument set, and the query keys that reach the wire
// must be ones that route actually reads.
//
// A schema accepting a key is not enough: `fields` passes every list schema but
// only TicketService.list reads it (BaseService.list and the other services
// ignore it), and the ticket-category schema accepts page/sort/order while
// CategoryService.listTicketCategories pages by limit+offset and sorts by
// sort_by/sort_order. So each contract also says how the service pages, and
// sort enums are the columns each service can actually order by.
// Checked against alga-psa main @ 41626b1e (2026-11-09).
//
// Mocked-fetch route tests only prove we send what we meant to send; this file
// pins what we meant to Alga. When a tool gains a parameter, add it here only
// after checking the Alga source cited next to the route.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
import { executeTool } from '../executor.js';
import { ALL_TOOLS } from '../tools/index.js';
import type { Field } from '../tools/shared.js';
import { json, KEY } from './helpers.js';

/**
 * Query keys ApiBaseController.list reads besides the route's querySchema. It
 * also forwards `fields`, but only TicketService.list reads that.
 */
const BASE_LIST = ['page', 'limit', 'sort', 'order'];
/** schemas/common.ts paginationQuerySchema without `fields` (routes with their own list()). */
const PAGE_SORT = BASE_LIST;
/** schemas/common.ts baseFilterSchema. */
const BASE_FILTER = [
  'search',
  'created_from',
  'created_to',
  'updated_from',
  'updated_to',
  'is_active',
];

interface RouteContract {
  path: string;
  paginated: boolean;
  /** How the service pages: by page (the default when paginated) or by limit+offset. */
  paging?: 'offset';
  keys: string[];
  /** Alga enums and sort allowlists: every value a tool offers must be one Alga accepts. */
  enums?: Record<string, string[]>;
}

const APPROVAL = ['DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'];
const ROUTES: Record<string, RouteContract> = {
  // ticket.ts ticketListQuerySchema; TicketService.list reads fields against
  // TICKET_LIST_FIELD_ALLOWLIST and sort against TICKET_LIST_API_SORT_SQL.
  alga_tickets_list: {
    path: '/tickets',
    paginated: true,
    enums: {
      sort: [
        ...['ticket_number', 'title', 'entered_at', 'updated_at', 'closed_at', 'due_date'],
        ...['client_name', 'status_name', 'priority_name', 'latest_activity_at'],
      ],
    },
    keys: [
      ...BASE_LIST,
      'fields',
      ...BASE_FILTER,
      ...['title', 'ticket_number', 'board_id', 'client_id', 'location_id', 'contact_name_id'],
      ...['status_id', 'status_ids', 'category_id', 'subcategory_id', 'entered_by', 'assigned_to'],
      ...['priority_id', 'is_open', 'is_closed', 'has_assignment', 'response_state'],
      ...['entered_from', 'entered_to', 'closed_from', 'closed_to', 'client_name', 'contact_name'],
      ...['status_name', 'priority_name', 'category_name', 'board_name', 'external_system'],
      ...['external_id', 'bundle_view', 'tags'],
    ],
  },
  alga_tickets_get: { path: '/tickets/t1', paginated: false, keys: [] },
  // ticket.ts ticketSearchSchema: unpaginated; arrays arrive comma-separated.
  alga_tickets_search: {
    path: '/tickets/search',
    paginated: false,
    keys: [
      ...['query', 'fields', 'status_ids', 'priority_ids', 'client_ids', 'assigned_to_ids'],
      ...['include_closed', 'limit'],
    ],
  },
  // ApiTicketController.getComments reads only these four.
  alga_tickets_comments_list: {
    path: '/tickets/t1/comments',
    paginated: false,
    keys: ['limit', 'offset', 'order', 'content_format'],
    enums: { order: ['asc', 'desc'], content_format: ['full', 'markdown'] },
  },
  // getTimeEntries / getAssets: createSuccessResponse, no query.
  alga_tickets_time_entries_list: { path: '/tickets/t1/time-entries', paginated: false, keys: [] },
  alga_tickets_assets_list: { path: '/tickets/t1/assets', paginated: false, keys: [] },
  // ticket.ts externalLinkLookupQuerySchema.
  alga_tickets_get_by_external_link: {
    path: '/tickets/by-external-link',
    paginated: false,
    keys: ['system', 'external_id', 'external_parent_id'],
  },
  // client.ts clientListQuerySchema.
  alga_clients_list: {
    path: '/clients',
    paginated: true,
    keys: [
      ...BASE_LIST,
      ...BASE_FILTER,
      ...['client_name', 'email', 'client_type', 'billing_cycle', 'is_inactive', 'is_tax_exempt'],
      ...['account_manager_id', 'region_code', 'credit_balance_min', 'credit_balance_max'],
      ...['has_credit_limit', 'industry', 'company_size'],
    ],
    // ClientService.list: orderBy(`c.${sort}`), no allowlist.
    enums: {
      client_type: ['company', 'individual'],
      sort: ['client_name', 'created_at', 'updated_at'],
    },
  },
  alga_clients_get: { path: '/clients/t1', paginated: false, keys: [] },
  // ApiClientController.getLocations: createSuccessResponse, no query.
  alga_clients_locations_list: { path: '/clients/t1/locations', paginated: false, keys: [] },
  // ApiClientController.getContacts: page, limit and contactFilterSchema minus client_id.
  alga_clients_contacts_list: {
    path: '/clients/t1/contacts',
    paginated: true,
    keys: [
      ...['page', 'limit'],
      ...BASE_FILTER,
      ...['full_name', 'email', 'phone_number', 'role', 'is_inactive', 'has_client'],
      ...['client_name', 'location_id', 'work_arrangement'],
    ],
  },
  // contact.ts contactListQuerySchema.
  alga_contacts_list: {
    path: '/contacts',
    paginated: true,
    keys: [
      ...BASE_LIST,
      ...BASE_FILTER,
      ...['full_name', 'email', 'phone_number', 'client_id', 'role', 'is_inactive', 'has_client'],
      ...['client_name', 'location_id', 'work_arrangement'],
    ],
    // ContactService.list: client_name/phone_number mapped, else orderBy(`c.${sort}`).
    enums: {
      sort: ['full_name', 'email', 'client_name', 'phone_number', 'created_at', 'updated_at'],
    },
  },
  alga_contacts_get: { path: '/contacts/t1', paginated: false, keys: [] },
  // contact.ts contactSearchSchema: unpaginated; fields picks columns to match.
  alga_contacts_search: {
    path: '/contacts/search',
    paginated: false,
    keys: ['query', 'fields', 'client_id', 'include_inactive', 'limit'],
  },
  // timeEntry.ts timeEntryFilterSchema.
  alga_time_entries_list: {
    path: '/time-entries',
    paginated: true,
    keys: [
      ...BASE_LIST,
      ...BASE_FILTER,
      ...['user_id', 'work_item_id', 'work_item_type', 'service_id', 'approval_status'],
      ...['is_billable', 'start_time_from', 'start_time_to', 'end_time_from', 'end_time_to'],
      ...['date_from', 'date_to', 'time_sheet_id', 'contract_line_id', 'client_id'],
    ],
    enums: {
      work_item_type: [
        ...['ticket', 'project_task', 'non_billable_category', 'ad_hoc', 'interaction'],
        'co_managed',
      ],
      approval_status: APPROVAL,
      // TimeEntryService.list: orderBy(`time_entries.${sort}`), no allowlist.
      sort: ['start_time', 'end_time', 'billable_duration', 'created_at', 'updated_at'],
    },
  },
  alga_time_entries_get: { path: '/time-entries/t1', paginated: false, keys: [] },
  // timeSheet.ts timeSheetListQuerySchema (sort is an enum; timeSheetSort.ts).
  alga_time_sheets_list: {
    path: '/time-sheets',
    paginated: true,
    keys: [
      ...BASE_LIST,
      ...BASE_FILTER,
      ...['user_id', 'period_id', 'approval_status', 'submitted_from', 'submitted_to'],
      ...['approved_from', 'approved_to', 'approved_by', 'has_entries', 'period_start_from'],
    ],
    enums: {
      approval_status: APPROVAL,
      sort: ['approval_status', 'approved_at', 'period_end', 'period_start', 'submitted_at'],
    },
  },
  // phase_id is applied by the executor, never sent.
  alga_projects_task_status_mappings_list: {
    path: '/projects/t1/task-status-mappings',
    paginated: false,
    keys: [],
  },
  // project.ts projectListQuerySchema; ApiProjectController.list ignores fields.
  alga_projects_list: {
    path: '/projects',
    paginated: true,
    keys: [
      ...PAGE_SORT,
      ...BASE_FILTER,
      ...['client_id', 'status', 'assigned_to', 'contact_name_id', 'start_date_from'],
      ...['start_date_to', 'end_date_from', 'end_date_to'],
    ],
    // ProjectService.list: orderBy(`projects.${sort}`), no allowlist.
    enums: { sort: ['project_name', 'start_date', 'end_date', 'created_at', 'updated_at'] },
  },
  alga_projects_get: { path: '/projects/t1', paginated: false, keys: [] },
  alga_projects_phases_list: { path: '/projects/t1/phases', paginated: false, keys: [] },
  // phase_id moves into the path.
  alga_projects_tasks_list: { path: '/projects/t1/phases/t1/tasks', paginated: false, keys: [] },
  alga_projects_tasks_get: { path: '/projects/tasks/t1', paginated: false, keys: [] },
  // asset.ts assetListQuerySchema via ApiAssetController.list (no fields).
  // AssetService.list orders by an unqualified sort over a query joined to
  // clients, so no sort column is offered; order applies to its created_at default.
  alga_assets_list: {
    path: '/assets',
    paginated: true,
    enums: { sort: [] },
    keys: [
      ...PAGE_SORT,
      ...BASE_FILTER,
      ...['asset_tag', 'name', 'client_id', 'location_id', 'contact_name_id', 'asset_type'],
      ...['status', 'location', 'manufacturer', 'model'],
    ],
  },
  alga_assets_get: { path: '/assets/t1', paginated: false, keys: [] },
  // asset.ts assetSearchSchema: its array filters fail z.array over GET, so only these work.
  alga_assets_search: {
    path: '/assets/search',
    paginated: false,
    keys: ['query', 'include_extension_data', 'limit'],
  },
  // ApiInvoiceController.list + InvoiceService.applyInvoiceFilters / rangeFilterColumns.
  alga_invoices_list: {
    path: '/invoices',
    paginated: true,
    keys: [
      ...PAGE_SORT,
      ...['include_items', 'include_client', 'include_billing_cycle', 'include_transactions'],
      ...['status', 'client_id', 'invoice_number', 'min_amount', 'max_amount', 'is_manual'],
      ...['is_prepayment', 'has_billing_cycle', 'billing_cycle_id', 'has_credit_applied'],
      ...['created_from', 'created_to', 'updated_from', 'updated_to', 'invoice_date_from'],
      ...['invoice_date_to', 'due_date_from', 'due_date_to', 'finalized_date_from'],
      'finalized_date_to',
    ],
    enums: {
      status: [
        ...['draft', 'sent', 'paid', 'overdue', 'cancelled', 'pending', 'prepayment'],
        'partially_applied',
      ],
      // InvoiceService.list: orderBy(`invoices.${sort}`), no allowlist.
      sort: [
        ...['invoice_date', 'due_date', 'invoice_number', 'total_amount', 'created_at'],
        'updated_at',
      ],
    },
  },
  alga_invoices_get: { path: '/invoices/t1', paginated: false, keys: [] },
  // ApiInvoiceController.listItems: createSuccessResponse, no query.
  alga_invoices_items_list: { path: '/invoices/t1/items', paginated: false, keys: [] },
  // userSchemas.ts userFilterSchema.
  alga_users_list: {
    path: '/users',
    paginated: true,
    keys: [
      ...BASE_LIST,
      ...BASE_FILTER,
      ...['username', 'first_name', 'last_name', 'email', 'phone', 'user_type', 'role_id'],
      ...['role_name', 'team_id', 'contact_id', 'is_inactive', 'two_factor_enabled'],
      'is_google_user',
    ],
    // UserService.list -> BaseService.applySorting: an unqualified orderBy on the
    // users table, which also holds hashed_password, so sort must stay an allowlist.
    // The projection is USER_RESPONSE_COLUMNS; fields is never read.
    enums: { sort: ['username', 'first_name', 'last_name', 'email', 'created_at', 'updated_at'] },
  },
  alga_users_get: { path: '/users/t1', paginated: false, keys: [] },
  // teamSchemas.ts teamFilterSchema.
  alga_teams_list: {
    path: '/teams',
    paginated: true,
    keys: [
      ...BASE_LIST,
      ...BASE_FILTER,
      ...['team_name', 'description', 'manager_id', 'member_count_min', 'member_count_max'],
      ...['has_manager', 'project_id', 'location'],
    ],
    // TeamService.list allowedSortFields.
    enums: {
      sort: [
        ...['team_id', 'team_name', 'manager_id', 'created_at', 'updated_at', 'manager_name'],
        'member_count',
      ],
    },
  },
  // board.ts boardListQuerySchema.
  alga_boards_list: {
    path: '/boards',
    paginated: true,
    keys: [...BASE_LIST, 'include_inactive', 'search'],
    // BoardService.list validSortFields.
    enums: { sort: ['display_order', 'board_name', 'is_inactive', 'is_default'] },
  },
  // status.ts statusListQuerySchema: `type`, and board_id is required when type=ticket.
  alga_statuses_list: {
    path: '/statuses',
    paginated: true,
    keys: [...BASE_LIST, 'type', 'search', 'board_id'],
    // StatusService.list: orderBy(sort) on statuses, no allowlist.
    enums: {
      type: ['ticket', 'project', 'project_task', 'interaction'],
      sort: ['name', 'order_number'],
    },
  },
  // priority.ts priorityListQuerySchema; PriorityService.list: orderBy(sort), no allowlist.
  alga_priorities_list: {
    path: '/priorities',
    paginated: true,
    keys: [...BASE_LIST, 'search'],
    enums: { sort: ['priority_name', 'order_number'] },
  },
  // ApiCategoryController.listTicketCategories reads page and limit only for the
  // reply's pagination block; CategoryService.listTicketCategories (288-353) reads
  // board_id, search, parent_category, created_from/_to, limit, offset, sort_by,
  // sort_order and include_hierarchy. It never reads page, sort or order.
  alga_ticket_categories_list: {
    path: '/categories/ticket',
    paginated: true,
    paging: 'offset',
    keys: [
      ...['page', 'limit', 'offset', 'sort_by', 'sort_order', 'board_id', 'parent_category'],
      ...['search', 'created_from', 'created_to', 'include_hierarchy'],
    ],
    // `categories` has created_at but no updated_at (CategoryService comment).
    enums: { sort_by: ['category_name', 'created_at'], sort_order: ['asc', 'desc'] },
  },
  // serviceSchemas.ts serviceListQuerySchema (sort is an enum).
  alga_services_list: {
    path: '/services',
    paginated: true,
    keys: [
      ...BASE_LIST,
      ...['search', 'item_kind', 'is_active', 'billing_method', 'category_id'],
      'custom_service_type_id',
    ],
    enums: { sort: ['service_name', 'billing_method', 'default_rate'] },
  },
  // contractLineSchemas.ts contractListQuerySchema via ContractLineService.listContracts:
  // no client_id or status; client-owned headers only, templates excluded.
  alga_contracts_list: {
    path: '/contracts',
    paginated: true,
    keys: [
      ...PAGE_SORT,
      ...BASE_FILTER,
      ...['contract_name', 'is_active', 'has_plans', 'clients_count_min', 'clients_count_max'],
    ],
    // listContracts sortColumns.
    enums: {
      sort: ['contract_name', 'billing_frequency', 'is_active', 'created_at', 'updated_at'],
    },
  },
  // ApiSearchController searchApiQuerySchema.
  alga_search: {
    path: '/search',
    paginated: false,
    keys: ['query', 'types', 'limit', 'cursor', 'sort'],
    enums: { sort: ['relevance', 'recent'] },
  },
  // timeSheet.ts scheduleEntrySearchQuerySchema: page, limit and three filters.
  alga_schedules_list: {
    path: '/schedules/search',
    paginated: true,
    keys: ['page', 'limit', 'start_date', 'end_date', 'user_id'],
  },
  // kbArticle.ts kbArticleListQuerySchema.
  alga_kb_articles_list: {
    path: '/kb-articles',
    paginated: true,
    keys: [...BASE_LIST, 'status', 'audience', 'article_type', 'category_id', 'search'],
    enums: {
      status: ['draft', 'review', 'published', 'archived'],
      audience: ['internal', 'client', 'public'],
      article_type: ['how_to', 'faq', 'troubleshooting', 'reference'],
      // KbArticleService.list: orderBy(`ka.${sort}`) over KB_ARTICLE_SELECT_COLUMNS.
      sort: [
        ...['created_at', 'updated_at', 'published_at', 'last_reviewed_at', 'next_review_due'],
        'view_count',
      ],
    },
  },
  alga_kb_articles_get: { path: '/kb-articles/t1', paginated: false, keys: [] },
};

const SAMPLES = ['t1', '2026-01-01', '2026-01-01T00:00:00Z', 'title', 'full_name', 'ticket'];
function sample(field: Field): unknown {
  if (field.enum) return field.enum[0];
  if (field.type === 'boolean') return true;
  if (field.type === 'integer') return Math.max(field.minimum ?? 1, 1);
  const value = SAMPLES.find((s) => !field.pattern || new RegExp(field.pattern).test(s));
  if (value === undefined) throw new Error(`no sample matches ${field.pattern}`);
  return value;
}

beforeEach(() => {
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  vi.mocked(fetch).mockImplementation(async () => json({ data: [] }) as never);
});
afterEach(() => vi.restoreAllMocks());

it('has a vendored Alga contract for every tool and no stale entries', () => {
  expect(Object.keys(ROUTES).sort()).toEqual(ALL_TOOLS.map((t) => t.name).sort());
});

it.each(ALL_TOOLS.map((t) => [t.name, t] as const))(
  '%s sends only query keys its Alga route reads',
  async (name, tool) => {
    const contract = ROUTES[name];
    const args = Object.fromEntries(
      Object.entries(tool.inputSchema.properties).map(([key, field]) => [key, sample(field)]),
    );
    await executeTool(tool, args, { instanceUrl: 'https://psa.example.com', apiKey: KEY });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.pathname).toBe(`/api/v1${contract.path}`);
    const sent = [...url.searchParams.keys()];
    for (const key of sent) expect(contract.keys, `${name} sends ${key}`).toContain(key);
    expect(tool.paginated).toBe(contract.paginated);
    expect(sent.includes('page'), `${name} page`).toBe(contract.paginated);
    for (const key of ['sort', 'sort_by'])
      if (tool.inputSchema.properties[key])
        expect(contract.enums?.[key], `${name}.${key} needs a vendored allowlist`).toBeDefined();
    for (const [key, allowed] of Object.entries(contract.enums ?? {})) {
      const offered = tool.inputSchema.properties[key]?.enum;
      if (!tool.inputSchema.properties[key]) continue;
      expect(offered, `${name}.${key} should be an enum`).toBeDefined();
      for (const value of offered!) expect(allowed, `${name}.${key}`).toContain(value);
    }
  },
);

const creds = { instanceUrl: 'https://psa.example.com', apiKey: KEY };
const sentQuery = () =>
  Object.fromEntries(new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams);

it.each(ALL_TOOLS.filter((t) => t.paginated).map((t) => [t.name, t] as const))(
  '%s reaches page 2 the way its Alga service pages',
  async (name, tool) => {
    await executeTool(tool, { ...requiredArgs(tool), page: 2, limit: 25 }, creds);
    const query = sentQuery();
    if (ROUTES[name].paging === 'offset') expect(query.offset).toBe('25');
    else expect(query).toMatchObject({ page: '2', limit: '25' });
  },
);

it.each(ALL_TOOLS.filter((t) => t.inputSchema.properties.limit).map((t) => [t.name, t] as const))(
  '%s sends its schema maximum limit unchanged',
  async (_name, tool) => {
    const max = tool.inputSchema.properties.limit.maximum!;
    await executeTool(tool, { ...requiredArgs(tool), limit: max }, creds);
    expect(sentQuery().limit).toBe(String(max));
  },
);

function requiredArgs(tool: (typeof ALL_TOOLS)[number]) {
  return Object.fromEntries(
    tool.inputSchema.required.map((key) => [key, sample(tool.inputSchema.properties[key])]),
  );
}

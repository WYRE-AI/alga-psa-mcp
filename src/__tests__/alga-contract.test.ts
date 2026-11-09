// Alga's own query contract, vendored by hand from Nine-Minds/alga-psa
// (server/src/lib/api/schemas/*.ts and the controllers that parse each route).
// Each tool is driven through the real executor with every argument set, and
// the query keys that reach the wire must be ones that route actually reads.
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

/** Query keys ApiBaseController.list reads besides the route's querySchema. */
const BASE_LIST = ['page', 'limit', 'sort', 'order', 'fields'];
/** schemas/common.ts paginationQuerySchema without `fields` (routes with their own list()). */
const PAGE_SORT = ['page', 'limit', 'sort', 'order'];
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
  keys: string[];
  /** Alga enums: every value a tool offers must be one Alga accepts. */
  enums?: Record<string, string[]>;
}

const APPROVAL = ['DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'];
const ROUTES: Record<string, RouteContract> = {
  // ticket.ts ticketListQuerySchema; ApiTicketController.list reads fields too.
  alga_tickets_list: {
    path: '/tickets',
    paginated: true,
    keys: [
      ...BASE_LIST,
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
    enums: { client_type: ['company', 'individual'] },
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
  },
  alga_projects_get: { path: '/projects/t1', paginated: false, keys: [] },
  alga_projects_phases_list: { path: '/projects/t1/phases', paginated: false, keys: [] },
  // phase_id moves into the path.
  alga_projects_tasks_list: { path: '/projects/t1/phases/t1/tasks', paginated: false, keys: [] },
  alga_projects_tasks_get: { path: '/projects/tasks/t1', paginated: false, keys: [] },
  // asset.ts assetListQuerySchema via ApiAssetController.list (no fields).
  alga_assets_list: {
    path: '/assets',
    paginated: true,
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
  },
  // board.ts boardListQuerySchema.
  alga_boards_list: {
    path: '/boards',
    paginated: true,
    keys: [...BASE_LIST, 'include_inactive', 'search'],
  },
  // status.ts statusListQuerySchema: `type`, and board_id is required when type=ticket.
  alga_statuses_list: {
    path: '/statuses',
    paginated: true,
    keys: [...BASE_LIST, 'type', 'search', 'board_id'],
    enums: { type: ['ticket', 'project', 'project_task', 'interaction'] },
  },
  // priority.ts priorityListQuerySchema.
  alga_priorities_list: { path: '/priorities', paginated: true, keys: [...BASE_LIST, 'search'] },
  // categorySchemas.ts ticketCategoryListQuerySchema via listTicketCategories (no fields).
  alga_ticket_categories_list: {
    path: '/categories/ticket',
    paginated: true,
    keys: [
      ...PAGE_SORT,
      ...BASE_FILTER,
      ...['category_name', 'board_id', 'parent_category', 'is_parent', 'is_child', 'depth'],
      ...['active', 'offset', 'sort_by', 'sort_order', 'include_hierarchy', 'category_type'],
    ],
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
  // contractLineSchemas.ts contractListQuerySchema via listContracts: no client_id or status.
  alga_contracts_list: {
    path: '/contracts',
    paginated: true,
    keys: [
      ...PAGE_SORT,
      ...BASE_FILTER,
      ...['contract_name', 'is_active', 'has_plans', 'clients_count_min', 'clients_count_max'],
    ],
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
    for (const [key, allowed] of Object.entries(contract.enums ?? {})) {
      const offered = tool.inputSchema.properties[key]?.enum;
      if (!tool.inputSchema.properties[key]) continue;
      expect(offered, `${name}.${key} should be an enum`).toBeDefined();
      for (const value of offered!) expect(allowed, `${name}.${key}`).toContain(value);
    }
  },
);

import { tool, id, str, bool } from './shared.js';
export const catalog = [
  tool('alga_users_list', 'Return a page of users; filter by search or inactive state.', 'GET', '/users', 'read', { search: str, is_inactive: bool }, [], true),
  tool('alga_users_get', 'Return one user profile by ID.', 'GET', '/users/{id}', 'read', { id }, ['id']),
  tool('alga_boards_list', 'Return a page of ticket boards, optionally filtered by name search.', 'GET', '/boards', 'read', { search: str }, [], true),
  tool('alga_statuses_list', 'Return a page of statuses; filter by board or status type.', 'GET', '/statuses', 'read', { board_id: id, status_type: str }, [], true),
  tool('alga_priorities_list', 'Return a page of priorities; filter by priority name search.', 'GET', '/priorities', 'read', { search: str }, [], true),
  tool('alga_ticket_categories_list', 'Return a page of ticket categories; filter by board or parent category.', 'GET', '/categories/ticket', 'read', { board_id: id, parent_category: id }, [], true),
  tool('alga_services_list', 'Return a page of services; filter by name search or category.', 'GET', '/services', 'read', { search: str, category_id: id }, [], true),
  tool('alga_contracts_list', 'Return a page of contracts; filter by client, status or search.', 'GET', '/contracts', 'read', { client_id: id, status: str, search: str }, [], true),
  tool('alga_search', 'Return cross-resource search results and a next cursor; filter by types and sort by relevance or recent.', 'GET', '/search', 'read', { query: { type: 'string', minLength: 1, maxLength: 200 }, types: str, cursor: str, limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 }, sort: { type: 'string', enum: ['relevance', 'recent'] } }, ['query']),
];

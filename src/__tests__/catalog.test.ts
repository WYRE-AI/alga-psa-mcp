import { routeTests, page } from './helpers.js';
routeTests([
  ['alga_users_list', 'GET', '/users', { is_inactive: false }, { ...page, is_inactive: false }],
  ['alga_users_get', 'GET', '/users/u1', { id: 'u1' }],
  ['alga_boards_list', 'GET', '/boards', { search: 'Support' }, { ...page, search: 'Support' }],
  ['alga_statuses_list', 'GET', '/statuses', { board_id: 'b1' }, { ...page, board_id: 'b1' }],
  ['alga_priorities_list', 'GET', '/priorities', {}, page],
  ['alga_ticket_categories_list', 'GET', '/categories/ticket', { board_id: 'b1' }, { ...page, board_id: 'b1' }],
  ['alga_services_list', 'GET', '/services', { category_id: 'c1' }, { ...page, category_id: 'c1' }],
  ['alga_contracts_list', 'GET', '/contracts', { client_id: 'c1' }, { ...page, client_id: 'c1' }],
  ['alga_search', 'GET', '/search', { query: 'Router', types: 'ticket,asset', sort: 'recent', cursor: 'next' }, { query: 'Router', types: 'ticket,asset', sort: 'recent', cursor: 'next', limit: 25 }],
]);

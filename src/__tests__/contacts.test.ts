import { routeTests, page } from './helpers.js';
routeTests([
  [
    'alga_contacts_list',
    'GET',
    '/contacts',
    { client_id: 'c1', is_inactive: false },
    { ...page, client_id: 'c1', is_inactive: false },
  ],
  ['alga_contacts_get', 'GET', '/contacts/p1', { id: 'p1' }],
  [
    'alga_contacts_search',
    'GET',
    '/contacts/search',
    { query: 'Ada', include_inactive: true, fields: 'full_name,email', limit: 10 },
    { query: 'Ada', include_inactive: true, fields: 'full_name,email', limit: 10 },
  ],
]);

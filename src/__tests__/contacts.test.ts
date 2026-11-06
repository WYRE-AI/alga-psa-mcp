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
    { query: 'Ada', include_inactive: true },
    { ...page, query: 'Ada', include_inactive: true },
  ],
  [
    'alga_contacts_create',
    'POST',
    '/contacts',
    { full_name: 'Ada', email: 'ada@example.com', client_id: 'c1' },
    {},
    { full_name: 'Ada', email: 'ada@example.com', client_id: 'c1' },
  ],
  ['alga_contacts_update', 'PUT', '/contacts/p1', { id: 'p1', notes: 'Hi' }, {}, { notes: 'Hi' }],
  ['alga_contacts_delete', 'DELETE', '/contacts/p1', { id: 'p1' }],
]);

import { routeTests, page } from './helpers.js';
routeTests([
  [
    'alga_clients_list',
    'GET',
    '/clients',
    { search: 'Acme', is_inactive: false },
    { ...page, search: 'Acme', is_inactive: false },
  ],
  ['alga_clients_get', 'GET', '/clients/c1', { id: 'c1' }],
  ['alga_clients_locations_list', 'GET', '/clients/c1/locations', { id: 'c1' }],
  ['alga_clients_contacts_list', 'GET', '/clients/c1/contacts', { id: 'c1' }, page],
]);

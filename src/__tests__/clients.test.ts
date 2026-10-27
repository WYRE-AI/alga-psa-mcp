import { routeTests, page } from './helpers.js';
routeTests([
  ['alga_clients_list', 'GET', '/clients', { search: 'Acme', is_inactive: false }, { ...page, search: 'Acme', is_inactive: false }],
  ['alga_clients_get', 'GET', '/clients/c1', { id: 'c1' }],
  ['alga_clients_locations_list', 'GET', '/clients/c1/locations', { id: 'c1' }, page],
  ['alga_clients_contacts_list', 'GET', '/clients/c1/contacts', { id: 'c1' }, page],
  ['alga_clients_create', 'POST', '/clients', { client_name: 'Acme', billing_cycle: 'monthly' }, {}, { client_name: 'Acme', billing_cycle: 'monthly' }],
  ['alga_clients_update', 'PUT', '/clients/c1', { id: 'c1', phone_no: '123' }, {}, { phone_no: '123' }],
  ['alga_clients_delete', 'DELETE', '/clients/c1', { id: 'c1' }],
  ['alga_clients_merge', 'POST', '/clients/source/merge', { id: 'source', target_client_id: 'target' }, {}, { target_client_id: 'target' }],
]);

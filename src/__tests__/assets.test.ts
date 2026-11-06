import { routeTests, page } from './helpers.js';
routeTests([
  [
    'alga_assets_list',
    'GET',
    '/assets',
    { client_id: 'c1', location_id: 'l1' },
    { ...page, client_id: 'c1', location_id: 'l1' },
  ],
  ['alga_assets_get', 'GET', '/assets/a1', { id: 'a1' }],
  [
    'alga_assets_search',
    'GET',
    '/assets/search',
    { query: 'Laptop', asset_types: 'workstation' },
    { ...page, query: 'Laptop', asset_types: 'workstation' },
  ],
  [
    'alga_assets_create',
    'POST',
    '/assets',
    {
      client_id: 'c1',
      asset_type: 'workstation',
      asset_tag: 'PC-1',
      name: 'Laptop',
      status: 'active',
    },
    {},
    {
      client_id: 'c1',
      asset_type: 'workstation',
      asset_tag: 'PC-1',
      name: 'Laptop',
      status: 'active',
    },
  ],
  [
    'alga_assets_update',
    'PUT',
    '/assets/a1',
    { id: 'a1', serial_number: 'SN123' },
    {},
    { serial_number: 'SN123' },
  ],
  ['alga_assets_delete', 'DELETE', '/assets/a1', { id: 'a1' }],
]);

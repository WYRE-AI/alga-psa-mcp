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
    { query: 'Laptop', include_extension_data: true },
    { query: 'Laptop', include_extension_data: true },
  ],
]);

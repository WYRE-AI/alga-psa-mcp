import { routeTests, page } from './helpers.js';
routeTests([
  [
    'alga_invoices_list',
    'GET',
    '/invoices',
    {
      client_id: 'c1',
      status: 'draft',
      invoice_date_from: '2026-03-01',
      invoice_date_to: '2026-03-31',
    },
    {
      ...page,
      client_id: 'c1',
      status: 'draft',
      invoice_date_from: '2026-03-01',
      invoice_date_to: '2026-03-31',
    },
  ],
  ['alga_invoices_get', 'GET', '/invoices/i1', { id: 'i1' }],
  ['alga_invoices_items_list', 'GET', '/invoices/i1/items', { id: 'i1' }],
]);

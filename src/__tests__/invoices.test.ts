import { routeTests, page } from './helpers.js';
routeTests([
  [
    'alga_invoices_list',
    'GET',
    '/invoices',
    { client_id: 'c1', status: 'draft' },
    { ...page, client_id: 'c1', status: 'draft' },
  ],
  ['alga_invoices_get', 'GET', '/invoices/i1', { id: 'i1' }],
  ['alga_invoices_items_list', 'GET', '/invoices/i1/items', { id: 'i1' }, page],
  ['alga_invoices_finalize', 'POST', '/invoices/i1/finalize', { id: 'i1' }, {}, {}],
  [
    'alga_invoices_send',
    'POST',
    '/invoices/i1/send',
    { id: 'i1', email_addresses: ['a@example.com'] },
    {},
    { email_addresses: ['a@example.com'] },
  ],
]);

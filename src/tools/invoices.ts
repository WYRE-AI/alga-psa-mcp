import { tool, id, str } from './shared.js';
export const invoices = [
  tool(
    'alga_invoices_list',
    'List invoices, one page at a time. Use to browse or filter by client, status or date range.',
    '/invoices',
    { client_id: id, status: str, start_date: str, end_date: str },
    [],
    true,
  ),
  tool(
    'alga_invoices_get',
    'Get one invoice by ID. Use after a list or search to see full details.',
    '/invoices/{id}',
    { id },
    ['id'],
  ),
  tool(
    'alga_invoices_items_list',
    'List line items on an invoice, one page at a time.',
    '/invoices/{id}/items',
    { id },
    ['id'],
    true,
  ),
];

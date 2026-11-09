import { tool, id, date, enumOf, sortBy } from './shared.js';
export const invoices = [
  // InvoiceService.applyInvoiceFilters skips keys it doesn't know, so only real keys are offered.
  tool(
    'alga_invoices_list',
    'List invoices, one page at a time. Filter by client, status, invoice date range or due date range (YYYY-MM-DD, inclusive).',
    '/invoices',
    {
      // InvoiceService.list: orderBy(`invoices.${sort}`).
      ...sortBy(
        ...['invoice_date', 'due_date', 'invoice_number', 'total_amount', 'created_at'],
        'updated_at',
      ),
      client_id: id,
      status: enumOf(
        'draft',
        'sent',
        'paid',
        'overdue',
        'cancelled',
        'pending',
        'prepayment',
        'partially_applied',
      ),
      invoice_date_from: date,
      invoice_date_to: date,
      due_date_from: date,
      due_date_to: date,
    },
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
    'List all line items on an invoice (not paginated).',
    '/invoices/{id}/items',
    { id },
    ['id'],
  ),
];

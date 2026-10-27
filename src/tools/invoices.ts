import { tool, id, str } from './shared.js';
export const invoices = [
  tool('alga_invoices_list', 'Return a page of invoices; filter by client, status or date range.', 'GET', '/invoices', 'read', { client_id: id, status: str, start_date: str, end_date: str }, [], true),
  tool('alga_invoices_get', 'Return one invoice by ID.', 'GET', '/invoices/{id}', 'read', { id }, ['id']),
  tool('alga_invoices_items_list', 'Return a page of line items on an invoice.', 'GET', '/invoices/{id}/items', 'read', { id }, ['id'], true),
  tool('alga_invoices_finalize', '⚠ DESTRUCTIVE: Finalize an invoice, committing its billing state; return the result.', 'POST', '/invoices/{id}/finalize', 'destructive', { id }, ['id']),
  tool('alga_invoices_send', '⚠ DESTRUCTIVE: Email the invoice to the client; return the delivery result.', 'POST', '/invoices/{id}/send', 'destructive', { id }, ['id']),
];

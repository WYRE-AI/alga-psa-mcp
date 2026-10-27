import { tool, id, str } from './shared.js';
const filters = { client_id: id, asset_type: str, status: str, location_id: id, search: str };
const assetFields = { client_id: id, asset_type: str, asset_tag: str, name: str, status: str, location_id: id, serial_number: str, manufacturer: str, model: str, purchase_date: str, warranty_end_date: str };
export const assets = [
  tool('alga_assets_list', 'Return a page of assets; filter by client, type, status, location or search.', 'GET', '/assets', 'read', filters, [], true),
  tool('alga_assets_get', 'Return one asset by ID.', 'GET', '/assets/{id}', 'read', { id }, ['id']),
  tool('alga_assets_search', 'Return assets matching a query; narrow by client, type, status or location.', 'GET', '/assets/search', 'read', { query: str, asset_types: str, statuses: str, client_ids: str }, ['query'], true),
  tool('alga_assets_create', 'Create and return an asset with a client, type, tag, name and status.', 'POST', '/assets', 'write', assetFields, ['client_id', 'asset_type', 'asset_tag', 'name', 'status']),
  tool('alga_assets_update', 'Update explicit asset inventory fields and return the asset.', 'PUT', '/assets/{id}', 'write', { id, ...assetFields }, ['id']),
  tool('alga_assets_delete', '⚠ DESTRUCTIVE: Delete an asset by ID; return the deletion result.', 'DELETE', '/assets/{id}', 'destructive', { id }, ['id']),
];

import { tool, id, str, bool, limit, sorting } from './shared.js';
export const assets = [
  tool(
    'alga_assets_list',
    'List assets, one page at a time. Use to browse or filter by client, type, status or location; use alga_assets_search to find assets by text.',
    '/assets',
    { ...sorting, client_id: id, asset_type: str, status: str, location_id: id, search: str },
    [],
    true,
  ),
  tool(
    'alga_assets_get',
    'Get one asset by ID. Use after a list or search to see full details.',
    '/assets/{id}',
    { id },
    ['id'],
  ),
  // assetSearchSchema's type, status and client filters are arrays Alga can't
  // parse from a GET query string, so only these parameters work.
  tool(
    'alga_assets_search',
    'Search assets by text and return up to limit matches (not paginated). To filter by client, type or status, use alga_assets_list instead.',
    '/assets/search',
    { query: { ...str, minLength: 1 }, include_extension_data: bool, limit: limit(100) },
    ['query'],
  ),
];

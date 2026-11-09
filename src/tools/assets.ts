import { tool, id, str } from './shared.js';
export const assets = [
  tool(
    'alga_assets_list',
    'List assets, one page at a time. Use to browse or filter by client, type, status or location; use alga_assets_search to find assets by text.',
    '/assets',
    { client_id: id, asset_type: str, status: str, location_id: id, search: str },
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
  tool(
    'alga_assets_search',
    'Search assets by text and return matches. Use when you have words to find; narrow by client, type or status.',
    '/assets/search',
    { query: str, asset_types: str, statuses: str, client_ids: str },
    ['query'],
    true,
  ),
];

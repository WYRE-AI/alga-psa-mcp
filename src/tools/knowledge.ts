import { tool, id, str } from './shared.js';
export const knowledge = [
  tool(
    'alga_kb_articles_list',
    'List knowledge articles, one page at a time. Use to browse or filter by search, category, audience or status.',
    '/kb-articles',
    { search: str, category_id: id, audience: str, status: str },
    [],
    true,
  ),
  tool(
    'alga_kb_articles_get',
    'Get one knowledge article by ID. Use after a list or search to see full details.',
    '/kb-articles/{id}',
    { id },
    ['id'],
  ),
];

import { tool, id, str, text } from './shared.js';
export const knowledge = [
  tool('alga_kb_articles_list', 'Return a page of knowledge articles; filter by search, category, audience or status.', 'GET', '/kb-articles', 'read', { search: str, category_id: id, audience: str, status: str }, [], true),
  tool('alga_kb_articles_get', 'Return one knowledge article by ID.', 'GET', '/kb-articles/{id}', 'read', { id }, ['id']),
  tool('alga_kb_articles_create', 'Create and return a draft knowledge article; this tool never publishes.', 'POST', '/kb-articles', 'write', { title: str, slug: str, article_type: str, audience: str, category_id: id, content: text, content_format: str }, ['title']),
];

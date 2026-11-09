import { tool, id, str, enumOf, sortBy } from './shared.js';
export const knowledge = [
  tool(
    'alga_kb_articles_list',
    'List knowledge articles, one page at a time. Use to browse or filter by search, category, type, audience or status.',
    '/kb-articles',
    {
      // KbArticleService.list: orderBy(`ka.${sort}`) over KB_ARTICLE_SELECT_COLUMNS.
      ...sortBy(
        ...['created_at', 'updated_at', 'published_at', 'last_reviewed_at', 'next_review_due'],
        'view_count',
      ),
      search: str,
      category_id: id,
      article_type: enumOf('how_to', 'faq', 'troubleshooting', 'reference'),
      audience: enumOf('internal', 'client', 'public'),
      status: enumOf('draft', 'review', 'published', 'archived'),
    },
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

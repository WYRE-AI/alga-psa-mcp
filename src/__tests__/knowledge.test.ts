import { routeTests, page } from './helpers.js';
routeTests([
  [
    'alga_kb_articles_list',
    'GET',
    '/kb-articles',
    { category_id: 'c1', status: 'draft' },
    { ...page, category_id: 'c1', status: 'draft' },
  ],
  ['alga_kb_articles_get', 'GET', '/kb-articles/k1', { id: 'k1' }],
]);

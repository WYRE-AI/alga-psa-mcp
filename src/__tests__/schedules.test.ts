import { routeTests, page } from './helpers.js';
routeTests([
  [
    'alga_schedules_list',
    'GET',
    '/schedules',
    { user_id: 'u1', start_date: '2026-01-01' },
    { ...page, user_id: 'u1', start_date: '2026-01-01' },
  ],
]);

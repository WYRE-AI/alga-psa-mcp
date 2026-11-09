import { routeTests, page } from './helpers.js';
routeTests([
  [
    'alga_projects_list',
    'GET',
    '/projects',
    { client_id: 'c1', status: 'open' },
    { ...page, client_id: 'c1', status: 'open' },
  ],
  ['alga_projects_get', 'GET', '/projects/p1', { id: 'p1' }],
  ['alga_projects_phases_list', 'GET', '/projects/p1/phases', { project_id: 'p1' }, {}],
  ['alga_projects_tasks_list', 'GET', '/projects/p1/tasks', { project_id: 'p1' }, {}],
  ['alga_projects_tasks_get', 'GET', '/projects/tasks/t1', { task_id: 't1' }],
]);

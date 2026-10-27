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
  [
    'alga_projects_tasks_create',
    'POST',
    '/projects/p1/phases/h1/tasks',
    { project_id: 'p1', phase_id: 'h1', task_name: 'Install', project_status_mapping_id: 's1' },
    {},
    { task_name: 'Install', project_status_mapping_id: 's1' },
  ],
  [
    'alga_projects_tasks_update',
    'PUT',
    '/projects/tasks/t1',
    { task_id: 't1', estimated_hours: 2 },
    {},
    { estimated_hours: 2 },
  ],
  ['alga_projects_delete', 'DELETE', '/projects/p1', { id: 'p1' }],
  ['alga_projects_tasks_delete', 'DELETE', '/projects/tasks/t1', { task_id: 't1' }],
]);

import { expect, it } from 'vitest';
import { validateArgs, ToolArgumentError } from '../executor.js';
import { ALL_TOOLS } from '../tools/index.js';
import { routeTests, page } from './helpers.js';

const STATUS_ID = '0b7c6f2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';
routeTests([
  [
    'alga_projects_list',
    'GET',
    '/projects',
    { client_id: 'c1', status: STATUS_ID },
    { ...page, client_id: 'c1', status: STATUS_ID },
  ],
  ['alga_projects_get', 'GET', '/projects/p1', { id: 'p1' }],
  ['alga_projects_phases_list', 'GET', '/projects/p1/phases', { project_id: 'p1' }, {}],
  ['alga_projects_tasks_list', 'GET', '/projects/p1/tasks', { project_id: 'p1' }, {}],
  ['alga_projects_tasks_get', 'GET', '/projects/tasks/t1', { task_id: 't1' }],
]);

// ProjectService.list compares status to projects.status, a uuid column; a name is a 500.
it.each(['active', 'planning', 'on_hold', 'open'])(
  'alga_projects_list refuses the status name %s before calling Alga',
  (status) => {
    const tool = ALL_TOOLS.find((t) => t.name === 'alga_projects_list')!;
    expect(() => validateArgs(tool, { status })).toThrow(ToolArgumentError);
    expect(tool.inputSchema.properties.status.description).toContain('alga_statuses_list');
  },
);

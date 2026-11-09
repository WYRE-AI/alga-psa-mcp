import { tool, id, str, sortBy, uuid } from './shared.js';
export const projects = [
  tool(
    'alga_projects_task_status_mappings_list',
    "List the task statuses a project uses, in the order Alga shows them, with the ID Alga uses for each (project_status_mapping_id). Pass phase_id to get the statuses for one phase; if that phase has no statuses of its own, you get the project's.",
    '/projects/{project_id}/task-status-mappings',
    { project_id: id, phase_id: id },
    ['project_id'],
  ),
  tool(
    'alga_projects_list',
    'List projects, one page at a time. Use to browse or filter by client, status or search.',
    '/projects',
    {
      // ProjectService.list: orderBy(`projects.${sort}`).
      ...sortBy('project_name', 'start_date', 'end_date', 'created_at', 'updated_at'),
      client_id: id,
      // ProjectService.list: where('projects.status', status), a uuid column. Names are
      // resolved to IDs only on create and update, so a name here is a Postgres error.
      status: {
        ...uuid,
        description: 'A project status ID; get IDs from alga_statuses_list with type=project.',
      },
      search: str,
    },
    [],
    true,
  ),
  tool(
    'alga_projects_get',
    'Get one project by ID. Use after a list or search to see full details.',
    '/projects/{id}',
    { id },
    ['id'],
  ),
  tool(
    'alga_projects_phases_list',
    'List all phases in a project. This list is not paginated.',
    '/projects/{project_id}/phases',
    { project_id: id },
    ['project_id'],
  ),
  tool(
    'alga_projects_tasks_list',
    'List all tasks in a project. Pass phase_id to list only one phase; get phase IDs from alga_projects_phases_list. These lists are not paginated.',
    '/projects/{project_id}/tasks',
    { project_id: id, phase_id: id },
    ['project_id'],
  ),
  tool(
    'alga_projects_tasks_get',
    'Get one project task by ID. Use after a list or search to see full details.',
    '/projects/tasks/{task_id}',
    { task_id: id },
    ['task_id'],
  ),
];

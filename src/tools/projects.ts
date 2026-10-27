import { tool, id, str, text, num } from './shared.js';
const taskFields = { task_name: { ...str, minLength: 1, maxLength: 255 }, description: text, assigned_to: id, estimated_hours: num, start_date: str, due_date: str, priority_id: id, project_status_mapping_id: id, task_type_key: str, wbs_code: str, tags: { type: 'array' as const, items: str, maxItems: 100 } };
export const projects = [
  tool('alga_projects_task_status_mappings_list', 'List project task status mappings in display order. Pass phase_id to get its effective scope: phase mappings if present, otherwise project mappings. Use these IDs when creating tasks.', 'GET', '/projects/{project_id}/task-status-mappings', 'read', { project_id: id, phase_id: id }, ['project_id']),
  tool('alga_projects_list', 'List projects, one page at a time. Use to browse or filter by client, status or search.', 'GET', '/projects', 'read', { client_id: id, status: str, search: str }, [], true),
  tool('alga_projects_get', 'Get one project by ID. Use after a list or search to see full details.', 'GET', '/projects/{id}', 'read', { id }, ['id']),
  tool('alga_projects_phases_list', 'List phases in a project, one page at a time.', 'GET', '/projects/{id}/phases', 'read', { id }, ['id'], true),
  tool('alga_projects_tasks_list', "List all tasks in a project. Pass phase_id to list only one phase; get phase IDs from alga_projects_phases_list. These lists are not paginated.", 'GET', '/projects/{project_id}/tasks', 'read', { project_id: id, phase_id: id }, ['project_id']),
  tool('alga_projects_tasks_get', 'Get one project task by ID. Use after a list or search to see full details.', 'GET', '/projects/tasks/{taskId}', 'read', { taskId: id }, ['taskId']),
  tool('alga_projects_tasks_create', "Create a task in a project phase and return it. Omit project_status_mapping_id to use the first non-closed status by display_order in the phase’s effective scope, falling back to the first. Get IDs from alga_projects_task_status_mappings_list.", 'POST', '/projects/{id}/phases/{phaseId}/tasks', 'write', { id, phaseId: id, ...taskFields }, ['id', 'phaseId', 'task_name']),
  tool('alga_projects_tasks_update', 'Update a task and return it. Pass the task ID and only the fields you want to change.', 'PUT', '/projects/tasks/{taskId}', 'write', { taskId: id, ...taskFields }, ['taskId']),
  tool('alga_projects_delete', '⚠ DESTRUCTIVE: Delete a project permanently.', 'DELETE', '/projects/{id}', 'destructive', { id }, ['id']),
  tool('alga_projects_tasks_delete', '⚠ DESTRUCTIVE: Delete a project task permanently.', 'DELETE', '/projects/tasks/{taskId}', 'destructive', { taskId: id }, ['taskId']),
];

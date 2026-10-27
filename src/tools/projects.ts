import { tool, id, str, text, num } from './shared.js';
const taskFields = { task_name: str, description: text, assigned_to: id, estimated_hours: num, start_date: str, due_date: str, priority_id: id, project_status_mapping_id: id };
export const projects = [
  tool('alga_projects_list', 'Return a page of projects; filter by client, status or search.', 'GET', '/projects', 'read', { client_id: id, status: str, search: str }, [], true),
  tool('alga_projects_get', 'Return one project by ID.', 'GET', '/projects/{id}', 'read', { id }, ['id']),
  tool('alga_projects_phases_list', 'Return a page of phases in a project.', 'GET', '/projects/{id}/phases', 'read', { id }, ['id'], true),
  tool('alga_projects_tasks_list', 'Return a page of project tasks; filter by phase or assignee.', 'GET', '/projects/{id}/tasks', 'read', { id, phase_id: id, assigned_to: id }, ['id'], true),
  tool('alga_projects_task_get', 'Return one project task by task ID.', 'GET', '/projects/tasks/{taskId}', 'read', { taskId: id }, ['taskId']),
  tool('alga_projects_tasks_create', 'Create and return a task in a project phase with a status mapping.', 'POST', '/projects/{id}/phases/{phaseId}/tasks', 'write', { id, phaseId: id, ...taskFields }, ['id', 'phaseId', 'task_name', 'project_status_mapping_id']),
  tool('alga_projects_tasks_update', 'Update explicit project task fields and return the task.', 'PUT', '/projects/tasks/{taskId}', 'write', { taskId: id, ...taskFields }, ['taskId']),
  tool('alga_projects_delete', '⚠ DESTRUCTIVE: Delete a project by ID; return the deletion result.', 'DELETE', '/projects/{id}', 'destructive', { id }, ['id']),
  tool('alga_projects_tasks_delete', '⚠ DESTRUCTIVE: Delete a project task by task ID; return the deletion result.', 'DELETE', '/projects/tasks/{taskId}', 'destructive', { taskId: id }, ['taskId']),
];

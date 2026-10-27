import { routeTests, page } from './helpers.js';
routeTests([
  ['alga_schedules_list', 'GET', '/schedules', { user_id: 'u1', start_date: '2026-01-01' }, { ...page, user_id: 'u1', start_date: '2026-01-01' }],
  ['alga_schedules_create', 'POST', '/schedules', { title: 'Visit', scheduled_start: '2026-01-01T10:00:00Z', scheduled_end: '2026-01-01T11:00:00Z', assigned_user_ids: ['u1'] }, {}, { title: 'Visit', scheduled_start: '2026-01-01T10:00:00Z', scheduled_end: '2026-01-01T11:00:00Z', assigned_user_ids: ['u1'] }],
  ['alga_schedules_delete', 'DELETE', '/schedules/s1', { id: 's1' }],
]);

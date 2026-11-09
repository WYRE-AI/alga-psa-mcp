#!/usr/bin/env node
// Spawns the built stdio server (dist/index.js) and checks the default tool
// surface and the refusals that must happen before any network call. Makes no
// network call: the instance URL is plain http on a reserved .invalid name,
// which URL validation refuses before DNS. Upstream round-trips are covered by
// the mocked tests in src/__tests__.
// Usage: npm run build && npm run smoke
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SMOKE_KEY = 'alga-smoke-key-not-a-real-credential-0000';

const EXPECTED = [
  'alga_assets_get',
  'alga_assets_list',
  'alga_assets_search',
  'alga_boards_list',
  'alga_clients_contacts_list',
  'alga_clients_get',
  'alga_clients_list',
  'alga_clients_locations_list',
  'alga_contacts_get',
  'alga_contacts_list',
  'alga_contacts_search',
  'alga_contracts_list',
  'alga_invoices_get',
  'alga_invoices_items_list',
  'alga_invoices_list',
  'alga_kb_articles_get',
  'alga_kb_articles_list',
  'alga_priorities_list',
  'alga_projects_get',
  'alga_projects_list',
  'alga_projects_phases_list',
  'alga_projects_task_status_mappings_list',
  'alga_projects_tasks_get',
  'alga_projects_tasks_list',
  'alga_schedules_list',
  'alga_search',
  'alga_services_list',
  'alga_statuses_list',
  'alga_teams_list',
  'alga_ticket_categories_list',
  'alga_tickets_assets_list',
  'alga_tickets_comments_list',
  'alga_tickets_get',
  'alga_tickets_get_by_external_link',
  'alga_tickets_list',
  'alga_tickets_search',
  'alga_tickets_time_entries_list',
  'alga_time_entries_get',
  'alga_time_entries_list',
  'alga_time_sheets_list',
  'alga_users_get',
  'alga_users_list',
];

function fail(message) {
  console.error(`smoke-stdio: FAIL - ${message}`);
  process.exitCode = 1;
}

const textOf = (result) => result.content?.[0]?.text ?? '';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  env: {
    PATH: process.env.PATH ?? '',
    LOG_LEVEL: 'error',
    ALGA_INSTANCE_URL: 'http://psa.invalid',
    ALGA_API_KEY: SMOKE_KEY,
  },
});
const client = new Client({ name: 'smoke', version: '0.0.0' });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  if (tools.length !== EXPECTED.length)
    fail(`expected ${EXPECTED.length} tools, got ${tools.length}`);
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED))
    fail(`tool names differ: ${names.join(', ')}`);
  if (
    !tools.every(
      (t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false,
    )
  )
    fail('a default tool is not annotated read-only');

  const badUrl = await client.callTool({ name: 'alga_tickets_list', arguments: {} });
  if (!badUrl.isError || !/instance URL/.test(textOf(badUrl)))
    fail(`plain-http instance URL was not refused: ${textOf(badUrl).slice(0, 200)}`);
  if (textOf(badUrl).includes(SMOKE_KEY)) fail('key leaked into tool output');

  const traversal = await client.callTool({
    name: 'alga_tickets_get',
    arguments: { id: '../users' },
  });
  if (!traversal.isError || !/\bid\b/.test(textOf(traversal)))
    fail(`path traversal id was not refused: ${textOf(traversal).slice(0, 200)}`);

  const write = await client.callTool({ name: 'alga_tickets_create', arguments: {} });
  if (!write.isError || !/Unknown tool/.test(textOf(write)))
    fail('a former write tool was not refused as unknown');

  const unknown = await client.callTool({ name: 'alga_tickets_purge', arguments: {} });
  if (!unknown.isError) fail('unknown tool did not error');

  if (!process.exitCode)
    console.log(
      `smoke-stdio: OK (${tools.length} read-only tools; bad URL, traversal id and former write tool refused without a network call)`,
    );
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await client.close().catch(() => {});
}

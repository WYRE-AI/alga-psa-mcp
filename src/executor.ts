import {
  getCredentials,
  requestAlga,
  type AlgaCredentials,
  type QueryValue,
} from './alga-client.js';
import { toolInputTooLarge } from './input-limits.js';
import { redactSecrets } from './redact.js';
import type { Definition, Field } from './tools/shared.js';
import { pathSegment, ToolArgumentError } from './validate.js';
export { ToolArgumentError };
export const MAX_RESPONSE_BYTES = 100 * 1024;
function validateField(field: Field, value: unknown, name: string): void {
  const bad = () => {
    throw new ToolArgumentError(
      `Invalid value for ${name}. Check its type, length and allowed values in the tool's input schema.`,
    );
  };
  if (field.type === 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < (field.minimum ?? -Infinity) ||
      value > (field.maximum ?? Infinity)
    )
      return bad();
  } else if (field.type === 'boolean') {
    if (typeof value !== 'boolean') return bad();
  } else {
    if (
      typeof value !== 'string' ||
      value.length < (field.minLength ?? 0) ||
      value.length > (field.maxLength ?? Infinity) ||
      (field.enum && !field.enum.includes(value)) ||
      (field.pattern && (!new RegExp(field.pattern).test(value) || value === '.' || value === '..'))
    )
      return bad();
  }
}
export function validateArgs(tool: Definition, args: Record<string, unknown>): void {
  if (!args || Array.isArray(args) || typeof args !== 'object' || toolInputTooLarge(args))
    throw new ToolArgumentError(
      'Tool input is too large or invalid. Reduce the input and check the schema.',
    );
  for (const key of tool.inputSchema.required)
    if (args[key] === undefined || args[key] === '')
      throw new ToolArgumentError(`${key} is required. Supply it using the tool input schema.`);
  for (const [key, value] of Object.entries(args)) {
    if (!Object.hasOwn(tool.inputSchema.properties, key))
      throw new ToolArgumentError(
        `Unknown argument: ${key}. Remove it and check the tool input schema.`,
      );
    if (value !== undefined) validateField(tool.inputSchema.properties[key], value, key);
  }
}
export function renderResponse(value: unknown, secrets: string[] = []): string {
  // Redact before truncating so a secret can never survive as a cut-off prefix.
  const text = redactSecrets(JSON.stringify(value), secrets);
  const bytes = Buffer.byteLength(text);
  if (bytes <= MAX_RESPONSE_BYTES) return text;
  return (
    Buffer.from(text).subarray(0, MAX_RESPONSE_BYTES).toString('utf8').replace(/�$/, '') +
    '\n[TRUNCATED: use fields, narrower filters or a smaller limit.]'
  );
}
export async function executeTool(
  tool: Definition,
  args: Record<string, unknown>,
  creds: AlgaCredentials | null = getCredentials(),
): Promise<string> {
  validateArgs(tool, args);
  if (!creds?.apiKey || !creds.instanceUrl)
    throw new ToolArgumentError(
      'No Alga connection details found. Add the instance URL and API key in the connection settings.',
    );
  let route = tool.path;
  if (tool.name === 'alga_projects_tasks_list' && args.phase_id)
    route = '/projects/{project_id}/phases/{phase_id}/tasks';
  const pathKeys = [...route.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const path = route.replace(/\{([^}]+)\}/g, (_, key: string) => pathSegment(args[key], key));
  const values = Object.fromEntries(
    Object.entries(args).filter(
      ([key, value]) =>
        !pathKeys.includes(key) &&
        value !== undefined &&
        !(tool.name === 'alga_projects_task_status_mappings_list' && key === 'phase_id'),
    ),
  ) as Record<string, QueryValue>;
  const query: Record<string, QueryValue> = {
    ...(tool.paginated ? { page: 1, limit: 25 } : {}),
    ...values,
  };
  if (tool.name === 'alga_search' && query.limit === undefined) query.limit = 25;
  const result = await requestAlga(creds, path, query);
  const output =
    tool.name === 'alga_projects_task_status_mappings_list' && args.phase_id
      ? { data: effectiveMappings(result, String(args.phase_id)) }
      : result;
  return renderResponse(output, [creds.apiKey, process.env.CONDUIT_S2S_SECRET ?? '']);
}

/** The phase's own status mappings, or the project's when the phase has none, in display order. */
function effectiveMappings(value: unknown, phaseId: string): Record<string, unknown>[] {
  const data = (value as { data?: unknown })?.data;
  if (!Array.isArray(data))
    throw new ToolArgumentError(
      "Alga returned task statuses in an unexpected format. Check the project's task statuses in Alga and try again.",
    );
  const mappings = data as Record<string, unknown>[];
  const phase = mappings.filter((m) => m.phase_id === phaseId);
  return (phase.length ? phase : mappings.filter((m) => m.phase_id == null)).sort(
    (a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0),
  );
}

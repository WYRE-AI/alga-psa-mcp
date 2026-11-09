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
type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  !!value && typeof value === 'object' && !Array.isArray(value);
/** The rows a list reply can lose, and the reply rebuilt with fewer of them. */
interface List {
  rows: unknown[];
  withRows: (rows: unknown[]) => Json;
}
/** A top-level `data` array, or alga_search's `data.results` (its cursor and counts sit beside it). */
function listRows(value: unknown): List | undefined {
  if (!isObject(value)) return undefined;
  const data = value.data;
  if (Array.isArray(data)) return { rows: data, withRows: (rows) => ({ ...value, data: rows }) };
  if (isObject(data) && Array.isArray(data.results))
    return {
      rows: data.results,
      withRows: (rows) => ({ ...value, data: { ...data, results: rows } }),
    };
  return undefined;
}
const fits = (text: string) => Buffer.byteLength(text) <= MAX_RESPONSE_BYTES;

/** What to tell the model when only `kept` of `total` rows fit. */
export type TruncationHint = (kept: number, total: number) => string;
const cut = (kept: number, total: number) =>
  `Only the first ${kept} of ${total} rows in this response fit.`;
const smallerLimit: TruncationHint = (kept, total) =>
  `${cut(kept, total)} The next page starts after the rows left out, so to see them repeat this request with a smaller limit (at most ${Math.max(kept, 1)}).`;

/**
 * A hint that names a request the tool accepts: a smaller limit for tools that
 * page by page or cursor, the next offset for offset tools, and narrowing for
 * tools that return everything at once (they have no limit to shrink).
 */
export function truncationHint(tool: Definition, args: Record<string, unknown>): TruncationHint {
  const props = tool.inputSchema.properties;
  if (props.offset)
    return (kept, total) =>
      `${cut(kept, total)} To read on, repeat this request with offset=${Number(args.offset ?? 0) + Math.max(kept, 1)}.`;
  if (tool.paginated || props.cursor) return smallerLimit;
  return (kept, total) =>
    `${cut(kept, total)} This tool returns all its results at once, so to see the rest, narrow the request with more specific filters.`;
}

/**
 * Fits a list under the cap by dropping rows from the end and keeping every
 * other field (pagination, meta, cursor), so the model can still page on.
 * Returns undefined when even an empty list does not fit.
 */
function shrinkList(
  list: List,
  render: (v: unknown) => string,
  hint: TruncationHint,
): string | undefined {
  const total = list.rows.length;
  const build = (n: number) =>
    render({
      ...list.withRows(list.rows.slice(0, n)),
      truncated: true,
      returned_items: n,
      total_items_in_page: total,
      truncation_hint: hint(n, total),
    });
  if (!fits(build(0))) return undefined;
  // Output size only grows with n, so binary-search the largest n that fits.
  let lo = 0;
  let hi = total - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(build(mid))) lo = mid;
    else hi = mid - 1;
  }
  return build(lo);
}

export function renderResponse(
  value: unknown,
  secrets: string[] = [],
  hint: TruncationHint = smallerLimit,
): string {
  // Redact before measuring or truncating so a secret can never survive as a cut-off prefix.
  const render = (v: unknown) => redactSecrets(JSON.stringify(v), secrets);
  const text = render(value);
  if (fits(text)) return text;
  const list = listRows(value);
  const shrunk = list ? shrinkList(list, render, hint) : undefined;
  if (shrunk) return shrunk;
  return (
    Buffer.from(text).subarray(0, MAX_RESPONSE_BYTES).toString('utf8').replace(/�$/, '') +
    '\n[TRUNCATED: use narrower filters or a smaller limit.]'
  );
}
export async function executeTool(
  tool: Definition,
  args: Record<string, unknown>,
  creds: AlgaCredentials | null = getCredentials(),
  signal?: AbortSignal,
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
  // CategoryService pages by offset and never reads page; page still sets the reply's pagination.
  if (tool.name === 'alga_ticket_categories_list')
    query.offset = (Number(query.page) - 1) * Number(query.limit);
  const result = await requestAlga(creds, path, query, { signal });
  const output =
    tool.name === 'alga_projects_task_status_mappings_list' && args.phase_id
      ? { data: effectiveMappings(result, String(args.phase_id)) }
      : result;
  return renderResponse(
    output,
    [creds.apiKey, process.env.CONDUIT_S2S_SECRET ?? ''],
    truncationHint(tool, args),
  );
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

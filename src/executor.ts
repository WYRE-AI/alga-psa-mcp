import { getCredentials, requestAlga, type AlgaCredentials } from './alga-client.js';
import { toolInputTooLarge } from './input-limits.js';
import type { Definition, Field } from './tools/shared.js';
export const MAX_RESPONSE_BYTES = 100 * 1024;
export class ToolArgumentError extends Error {}
function validateField(field: Field, value: unknown, name: string): void {
  const bad = () => { throw new ToolArgumentError(`Invalid value for ${name}.`); };
  if (field.type === 'array') {
    if (!Array.isArray(value) || value.length > (field.maxItems ?? Infinity)) return bad();
    for (const item of value) if (field.items) validateField(field.items, item, name);
  } else if (field.type === 'integer' || field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value)) ||
      value < (field.minimum ?? -Infinity) || value > (field.maximum ?? Infinity)) return bad();
  } else if (field.type === 'boolean') { if (typeof value !== 'boolean') return bad(); }
  else {
    if (typeof value !== 'string' || value.length < (field.minLength ?? 0) || value.length > (field.maxLength ?? Infinity) ||
        (field.enum && !field.enum.includes(value)) || (field.pattern && (!new RegExp(field.pattern).test(value) || value === '.' || value === '..'))) return bad();
  }
}
export function validateArgs(tool: Definition, args: Record<string, unknown>): void {
  if (!args || Array.isArray(args) || typeof args !== 'object' || toolInputTooLarge(args)) throw new ToolArgumentError('Tool input is too large or invalid.');
  for (const key of tool.inputSchema.required) if (args[key] === undefined || args[key] === '') throw new ToolArgumentError(`${key} is required.`);
  for (const [key, value] of Object.entries(args)) {
    if (!Object.hasOwn(tool.inputSchema.properties, key)) throw new ToolArgumentError('Unknown tool argument.');
    if (value !== undefined) validateField(tool.inputSchema.properties[key], value, key);
  }
}
export function renderResponse(value: unknown, secrets: string[] = []): string {
  let text = JSON.stringify(value);
  for (const secret of secrets) if (secret) {
    text = text.split(secret).join('[REDACTED]');
    const encoded = JSON.stringify(secret).slice(1, -1);
    text = text.split(encoded).join('[REDACTED]');
  }
  const bytes = Buffer.byteLength(text);
  if (bytes <= MAX_RESPONSE_BYTES) return text;
  return Buffer.from(text).subarray(0, MAX_RESPONSE_BYTES).toString('utf8').replace(/�$/, '') + '\n[TRUNCATED: use fields, narrower filters or a smaller limit.]';
}
export async function executeTool(tool: Definition, args: Record<string, unknown>, creds: AlgaCredentials | null = getCredentials()): Promise<string> {
  validateArgs(tool, args);
  if (!creds?.apiKey || !creds.instanceUrl) throw new ToolArgumentError('No Alga credentials configured.');
  const pathKeys = [...tool.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const path = tool.path.replace(/\{([^}]+)\}/g, (_, key: string) => encodeURIComponent(String(args[key])));
  const values = Object.fromEntries(Object.entries(args).filter(([key, value]) => !pathKeys.includes(key) && value !== undefined));
  const query = tool.method === 'GET' ? { ...(tool.paginated ? { page: 1, limit: 25 } : {}), ...values } : {};
  if (tool.name === 'alga_search' && query.limit === undefined) query.limit = 25;
  let body: Record<string, unknown> | undefined = tool.method === 'POST' || tool.method === 'PUT' ? values : undefined;
  if (tool.name === 'alga_kb_articles_create') body = { ...values, status: 'draft' };
  const result = await requestAlga(creds, tool.method, path, query, body);
  return renderResponse(result, [creds.apiKey, process.env.CONDUIT_S2S_SECRET ?? '']);
}

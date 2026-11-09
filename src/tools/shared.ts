import type { Tier } from '../config.js';
export type { Tier };
/** Query fields are scalars only: Alga keeps one value per query key. */
export interface Field {
  type: 'string' | 'integer' | 'boolean';
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: string[];
  description?: string;
}
/** Every tool is a GET in the read tier; the types keep it that way. */
export interface Definition {
  name: string;
  description: string;
  method: 'GET';
  path: string;
  tier: Tier;
  inputSchema: {
    type: 'object';
    properties: Record<string, Field>;
    required: string[];
    additionalProperties: false;
  };
  paginated: boolean;
}
const ID_PATTERN = '[A-Za-z0-9_\\-:.]+';
/** A record ID. It may go into a URL path, so it is restricted to safe characters. */
export const id: Field = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: `^${ID_PATTERN}$`,
};
export const str: Field = { type: 'string', maxLength: 1000 };
export const bool: Field = { type: 'boolean' };
/** An ID from another system. Only ever sent as a query value, so any text is fine. */
export const externalId: Field = { type: 'string', minLength: 1, maxLength: 1000 };
export const enumOf = (...values: string[]): Field => ({ type: 'string', enum: values });
/** Alga's dateSchema: an RFC 3339 date-time in UTC. */
export const dateTime: Field = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$',
  description: 'UTC date-time, for example 2026-03-01T00:00:00Z.',
};
/** Alga's isoDateSchema: a calendar date. */
export const date: Field = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Date as YYYY-MM-DD.',
};
/** A comma-separated list of IDs (Alga splits these server-side). */
export const idList: Field = {
  type: 'string',
  maxLength: 4000,
  pattern: `^${ID_PATTERN}(,${ID_PATTERN})*$`,
  description: 'Comma-separated IDs.',
};
/** A comma-separated list drawn from fixed values (Alga splits these server-side). */
export function listOf(values: readonly string[], description: string): Field {
  const one = `(${values.join('|')})`;
  return { type: 'string', maxLength: 2000, pattern: `^${one}(,${one})*$`, description };
}
export const limit = (maximum: number, def = 25): Field => ({
  type: 'integer',
  minimum: 1,
  maximum,
  default: def,
});
export const order = enumOf('asc', 'desc');
/**
 * sort and order. Sort is always an enum of columns the route's Alga service can
 * order by: many services pass sort straight to ORDER BY, where an unknown column
 * is a 500 and a hidden one would be an ordering oracle.
 */
export const sortBy = (...columns: string[]): Record<string, Field> => ({
  sort: enumOf(...columns),
  order,
});
/** Sent on every paginated call. Page is passed through; Alga caps limit at 100. */
export const pageFields: Record<string, Field> = {
  page: { type: 'integer', minimum: 1, maximum: 1_000_000, default: 1 },
  limit: limit(100),
};
/** Shared schema fragments keep all hand-written definitions consistent. */
export function tool(
  name: string,
  description: string,
  path: string,
  properties: Record<string, Field> = {},
  required: string[] = [],
  paginated = false,
): Definition {
  return {
    name,
    description,
    method: 'GET',
    path,
    tier: 'read',
    paginated,
    inputSchema: {
      type: 'object',
      properties: { ...(paginated ? pageFields : {}), ...properties },
      required,
      additionalProperties: false,
    },
  };
}

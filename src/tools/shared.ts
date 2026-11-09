import type { Method } from '../alga-client.js';
import type { Tier } from '../config.js';
export type { Tier };
export interface Field {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'array';
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: string[];
  items?: Field;
  minItems?: number;
  maxItems?: number;
}
export interface Definition {
  name: string;
  description: string;
  method: Method;
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
export const id: Field = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9_\\-:.]+$',
};
export const str: Field = { type: 'string', maxLength: 1000 };
export const text: Field = { type: 'string', maxLength: 30000 };
export const bool: Field = { type: 'boolean' };
export const num: Field = { type: 'number', minimum: 0 };
export const ids: Field = { type: 'array', items: id, maxItems: 100 };
export const pageFields: Record<string, Field> = {
  // Page is passed through as given; only limit has an Alga maximum (100).
  page: { type: 'integer', minimum: 1, maximum: 1_000_000, default: 1 },
  limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  sort: { type: 'string', maxLength: 128 },
  order: { type: 'string', enum: ['asc', 'desc'] },
  fields: { type: 'string', maxLength: 1000 },
};
/** Shared schema fragments keep all hand-written definitions consistent. */
export function tool(
  name: string,
  description: string,
  method: Method,
  path: string,
  tier: Tier,
  properties: Record<string, Field> = {},
  required: string[] = [],
  paginated = false,
): Definition {
  return {
    name,
    description,
    method,
    path,
    tier,
    paginated,
    inputSchema: {
      type: 'object',
      properties: { ...(paginated ? pageFields : {}), ...properties },
      required,
      additionalProperties: false,
    },
  };
}

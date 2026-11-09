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
export const id: Field = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9_\\-:.]+$',
};
export const str: Field = { type: 'string', maxLength: 1000 };
export const bool: Field = { type: 'boolean' };
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

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Definition, Tier } from './shared.js';
export const flagEnabled = (value?: string): boolean => /^(true|1)$/i.test((value ?? '').trim());
export const writesEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  flagEnabled(env.ALGA_ENABLE_WRITES);
export const destructiveEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  flagEnabled(env.ALGA_ENABLE_DESTRUCTIVE);
export const readOnlyMode = (env: NodeJS.ProcessEnv = process.env) =>
  flagEnabled(env.READ_ONLY_MODE);
export function toolEnabled(tool: Definition, env: NodeJS.ProcessEnv): boolean {
  if (tool.tier === 'read') return true;
  if (readOnlyMode(env) || !writesEnabled(env)) return false;
  return tool.tier === 'write' || destructiveEnabled(env);
}
export function disabledReason(tool: Definition, env: NodeJS.ProcessEnv): string {
  if (readOnlyMode(env))
    return `${tool.name} is turned off because this container is in read-only mode. An admin can turn it off by setting READ_ONLY_MODE=false.`;
  if (tool.tier === 'write')
    return `${tool.name} is turned off because creating and changing records in Alga is off in this container. An admin can turn it on with ALGA_ENABLE_WRITES=true.`;
  return `${tool.name} is turned off because destructive actions in Alga are off in this container. An admin can turn them on with ALGA_ENABLE_WRITES=true and ALGA_ENABLE_DESTRUCTIVE=true.`;
}
export const selectEnabled = (all: Definition[], env: NodeJS.ProcessEnv): Definition[] =>
  all.filter((tool) => toolEnabled(tool, env));
export function annotationsFor(tier: Tier) {
  return { readOnlyHint: tier === 'read', destructiveHint: tier === 'destructive' };
}
export function toMcpTool(tool: Definition): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: annotationsFor(tool.tier),
  };
}

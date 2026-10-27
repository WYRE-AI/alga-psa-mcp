import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Definition, Tier } from './shared.js';
export const flagEnabled = (value?: string): boolean => /^(true|1)$/i.test(value ?? '');
export const destructiveEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  flagEnabled(env.ALGA_ENABLE_DESTRUCTIVE);
export function selectEnabled(all: Definition[], env: NodeJS.ProcessEnv): Definition[] {
  return all.filter(
    (tool) =>
      tool.tier === 'read' ||
      (!flagEnabled(env.READ_ONLY_MODE) && (tool.tier === 'write' || destructiveEnabled(env))),
  );
}
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

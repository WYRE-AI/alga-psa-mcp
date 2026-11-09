import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { configuredTiers, narrowTiers, readOnlyMode, type Tier } from '../config.js';
import type { Definition } from './shared.js';

export function disabledReason(tool: Definition, env: NodeJS.ProcessEnv): string {
  if (readOnlyMode(env))
    return `${tool.name} is turned off because this container is in read-only mode. An admin can turn it off by setting READ_ONLY_MODE=false.`;
  if (tool.tier === 'write')
    return `${tool.name} is turned off because creating and changing records in Alga is off in this container. An admin can turn it on with ALGA_ENABLE_WRITES=true.`;
  return `${tool.name} is turned off because destructive actions in Alga are off in this container. An admin can turn them on with ALGA_ENABLE_WRITES=true and ALGA_ENABLE_DESTRUCTIVE=true.`;
}

/** Tools in the container's tiers, narrowed by an X-Conduit-Tool-Tiers value when one was sent. */
export function selectEnabled(
  all: Definition[],
  env: NodeJS.ProcessEnv,
  tiersHeader?: string,
): Definition[] {
  const tiers = narrowTiers(configuredTiers(env), tiersHeader);
  return all.filter((tool) => tiers.has(tool.tier));
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

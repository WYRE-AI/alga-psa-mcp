import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { configuredTiers, narrowTiers } from '../config.js';
import type { Definition } from './shared.js';

/** Tools in the container's tiers, narrowed by an X-Conduit-Tool-Tiers value when one was sent. */
export function selectEnabled(
  all: Definition[],
  env: NodeJS.ProcessEnv,
  tiersHeader?: string,
): Definition[] {
  const tiers = narrowTiers(configuredTiers(env), tiersHeader);
  return all.filter((tool) => tiers.has(tool.tier));
}

export function toMcpTool(tool: Definition): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  };
}

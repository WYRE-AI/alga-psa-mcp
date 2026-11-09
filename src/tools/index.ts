import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { tickets } from './tickets.js';
import { clients } from './clients.js';
import { contacts } from './contacts.js';
import { time } from './time.js';
import { projects } from './projects.js';
import { assets } from './assets.js';
import { invoices } from './invoices.js';
import { catalog } from './catalog.js';
import { schedules } from './schedules.js';
import { knowledge } from './knowledge.js';
import { selectEnabled, toMcpTool } from './registry.js';
import { executeTool, ToolArgumentError } from '../executor.js';
import { AlgaApiError } from '../alga-client.js';
import { InstanceUrlError } from '../ssrf.js';
import { wrapUntrusted } from '../untrusted.js';
import { errorType, logger } from '../utils/logger.js';

/** The single inventory of all 42 hand-written Alga read tools. */
export const ALL_TOOLS = [
  ...tickets,
  ...clients,
  ...contacts,
  ...time,
  ...projects,
  ...assets,
  ...invoices,
  ...catalog,
  ...schedules,
  ...knowledge,
];
/** `tiersHeader` is the raw X-Conduit-Tool-Tiers value: undefined when absent, '' when empty. */
export const selectTools = (env: NodeJS.ProcessEnv = process.env, tiersHeader?: string) =>
  selectEnabled(ALL_TOOLS, env, tiersHeader);
export const listTools = (env: NodeJS.ProcessEnv = process.env, tiersHeader?: string) =>
  selectTools(env, tiersHeader).map(toMcpTool);
const errorResult = (text: string): CallToolResult => ({
  content: [{ type: 'text', text: `Error: ${text}` }],
  isError: true,
});
const UNKNOWN_TOOL = 'Unknown tool. Choose a tool from tools/list.';
export async function dispatchToolCall(
  name: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  tiersHeader?: string,
  signal?: AbortSignal,
): Promise<CallToolResult> {
  const tool = ALL_TOOLS.find((entry) => entry.name === name);
  if (!tool) return errorResult(UNKNOWN_TOOL);
  // Narrowed out for this request by Conduit: indistinguishable from an unknown tool.
  if (!selectTools(env, tiersHeader).includes(tool)) return errorResult(UNKNOWN_TOOL);
  try {
    return {
      content: [
        { type: 'text', text: wrapUntrusted(await executeTool(tool, args, undefined, signal)) },
      ],
    };
  } catch (error) {
    if (
      error instanceof ToolArgumentError ||
      error instanceof AlgaApiError ||
      error instanceof InstanceUrlError
    )
      return errorResult(error.message);
    // The message can carry credentials or tenant data, so only the class is logged.
    logger.error('Unexpected tool failure', { tool: tool.name, errorType: errorType(error) });
    return errorResult(
      'Alga tool request failed. Try again; if it keeps failing, check the connection settings.',
    );
  }
}

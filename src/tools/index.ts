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

/** The single inventory of all 71 hand-written Alga tools. */
export const ALL_TOOLS = [...tickets, ...clients, ...contacts, ...time, ...projects, ...assets, ...invoices, ...catalog, ...schedules, ...knowledge];
export const selectTools = (env: NodeJS.ProcessEnv = process.env) => selectEnabled(ALL_TOOLS, env);
export const listTools = (env: NodeJS.ProcessEnv = process.env) => selectTools(env).map(toMcpTool);
const errorResult = (text: string): CallToolResult => ({ content: [{ type: 'text', text: `Error: ${text}` }], isError: true });
export async function dispatchToolCall(name: string, args: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): Promise<CallToolResult> {
  const tool = ALL_TOOLS.find((entry) => entry.name === name);
  if (!tool) return errorResult('Unknown tool. Choose a tool from tools/list.');
  if (!selectTools(env).includes(tool)) return errorResult('This tool is turned off for this connection. An admin can enable write or destructive tools in the connection settings.');
  try { return { content: [{ type: 'text', text: await executeTool(tool, args) }] }; }
  catch (error) {
    return errorResult(error instanceof ToolArgumentError || error instanceof AlgaApiError || error instanceof InstanceUrlError ? error.message : 'Alga tool request failed. Try again; if it keeps failing, check the connection settings.');
  }
}

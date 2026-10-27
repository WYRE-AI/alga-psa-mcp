import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { dispatchToolCall, listTools } from './tools/index.js';
import { toolInputTooLarge, toolInputTooLargeResult } from './input-limits.js';
import { logger } from './utils/logger.js';

export function createServer(): Server {
  const server = new Server(
    { name: 'alga-psa-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, logging: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (toolInputTooLarge(args)) return toolInputTooLargeResult(name);
    try {
      return await dispatchToolCall(name, (args || {}) as Record<string, unknown>);
    } catch {
      logger.error('Tool call failed');
      return { content: [{ type: 'text' as const, text: 'Alga tool request failed.' }], isError: true };
    }
  });

  return server;
}

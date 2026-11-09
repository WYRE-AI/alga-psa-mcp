import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { dispatchToolCall, listTools } from './tools/index.js';
import { toolInputTooLarge, toolInputTooLargeResult } from './input-limits.js';
import { logger } from './utils/logger.js';

/**
 * `tiersHeader` is this request's raw X-Conduit-Tool-Tiers value (HTTP only).
 * Undefined means no narrowing; an empty string means no tools.
 */
export function createServer(tiersHeader?: string): Server {
  const server = new Server(
    { name: 'alga-psa-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, logging: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools(process.env, tiersHeader),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (toolInputTooLarge(args)) return toolInputTooLargeResult(name);
    try {
      return await dispatchToolCall(
        name,
        (args || {}) as Record<string, unknown>,
        process.env,
        tiersHeader,
      );
    } catch {
      logger.error('Tool call failed');
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Alga tool request failed. Try again; if it keeps failing, check the connection settings.',
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

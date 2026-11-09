import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { warnPrivateOverride } from './ssrf.js';
import { createServer } from './server.js';
import { selectTools } from './tools/index.js';
import { logger } from './utils/logger.js';

warnPrivateOverride();
selectTools();
const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
logger.info('Alga MCP server started (stdio)');

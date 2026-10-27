import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { runWithCredentials, validateTenantId } from './alga-client.js';
import { selectTools } from './tools/index.js';
import { logger } from './utils/logger.js';
import { MAX_REQUEST_BODY_BYTES } from './input-limits.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';
import { validateInstanceUrl, warnPrivateOverride, InstanceUrlError } from './ssrf.js';

// Conduit service-to-service auth (gateway#377 parity). HTTP startup fails
// closed: an empty CONDUIT_S2S_SECRET, or a known placeholder, refuses to
// boot unless MCP_ALLOW_INSECURE_DEV=1 (placeholders never qualify). That
// bypass skips X-Gateway-S2S and binds 127.0.0.1 only. A configured secret
// is always enforced and still honors MCP_HTTP_HOST (default 0.0.0.0) so
// container deploys keep their existing bind. The secret value is never logged.
// See src/s2s-verify.ts.

/** Public example values. A copied placeholder must not verify as a real secret. */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'replace-with-a-real-secret',
  'your-s2s-secret',
  'your-secret',
  'changeme',
  'change-me',
  'placeholder',
  'secret',
  'example',
  'replace-me',
  's2s-secret',
]);

const LOOPBACK_HOST = '127.0.0.1';

const MISSING_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is empty. ' +
  'Set CONDUIT_S2S_SECRET, or set MCP_ALLOW_INSECURE_DEV=1 for local development only.';

const PLACEHOLDER_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is a known placeholder. ' +
  'Generate a secret with `openssl rand -hex 32` and set CONDUIT_S2S_SECRET to that value. ' +
  'MCP_ALLOW_INSECURE_DEV does not bypass a placeholder secret.';

const INSECURE_DEV_WARNING =
  'SECURITY WARNING: CONDUIT_S2S_SECRET is empty and MCP_ALLOW_INSECURE_DEV=1. ' +
  'HTTP /mcp is not enforcing X-Gateway-S2S and is limited to loopback (127.0.0.1). ' +
  'Do not use this outside local development.';

const S2S_UNAUTHORIZED = {
  error:
    'Missing or invalid X-Gateway-S2S header: this endpoint only accepts requests signed by the gateway.',
};

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.+)\]$/, '$1');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function refuseStart(message: string): never {
  logger.error(message);
  throw new Error(message);
}

/**
 * Secret for X-Gateway-S2S on /mcp. Read at HTTP startup, not module load.
 * Empty is fail-closed unless MCP_ALLOW_INSECURE_DEV=1. A known placeholder
 * always refuses, including when the dev flag is set. The secret is never logged.
 */
function resolveS2sSecret(): string {
  const secret = (process.env.CONDUIT_S2S_SECRET ?? '').trim();
  if (secret && KNOWN_PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    refuseStart(PLACEHOLDER_S2S_SECRET_ERROR);
  }
  if (secret) return secret;

  if (process.env.MCP_ALLOW_INSECURE_DEV === '1') {
    // error level so LOG_LEVEL=warn|error cannot hide the bypass.
    logger.error(INSECURE_DEV_WARNING);
    return '';
  }

  refuseStart(MISSING_S2S_SECRET_ERROR);
}

/**
 * No secret (insecure-dev only) always binds 127.0.0.1. A non-loopback
 * MCP_HTTP_HOST is overridden and logged. A configured secret honors
 * MCP_HTTP_HOST, defaulting to 0.0.0.0 so container deploys stay unchanged.
 */
function resolveListenHost(s2sSecret: string): string {
  const configured = (process.env.MCP_HTTP_HOST ?? '').trim();
  if (s2sSecret) return configured || '0.0.0.0';

  if (configured && !isLoopbackHost(configured)) {
    logger.error(
      `WARNING: MCP_HTTP_HOST=${configured} is not a loopback address. ` +
        'MCP_ALLOW_INSECURE_DEV=1 without CONDUIT_S2S_SECRET cannot listen there. ' +
        `Binding ${LOOPBACK_HOST} only.`,
    );
  }
  return LOOPBACK_HOST;
}

export async function startHttpServer(): Promise<HttpServer> {
  const s2sSecret = resolveS2sSecret();
  selectTools();
  warnPrivateOverride();
  const port = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);
  const host = resolveListenHost(s2sSecret);
  const isGatewayMode = process.env.AUTH_MODE === 'gateway';

  const httpServer = createHttpServer((req, res) => {
    const route = async () => {
      const url = new URL(req.url || '/', 'http://localhost');

      if (url.pathname === '/health') {
        // /health is container LIVENESS, not credential-readiness. It stays
        // unauthenticated, does not call getCredentials(), and never returns
        // any credential material.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            transport: 'http',
            mode: isGatewayMode ? 'gateway' : 'standalone',
            timestamp: new Date().toISOString(),
          }),
        );
        return;
      }

      if (url.pathname !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }));
        return;
      }

      // S2S guard runs first: a forged request must never reach credential
      // extraction or the MCP server/transport. Empty s2sSecret is only
      // reachable when MCP_ALLOW_INSECURE_DEV=1.
      if (s2sSecret && !verifyS2sHeader(headerValue(req.headers[S2S_HEADER]), s2sSecret)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(S2S_UNAUTHORIZED));
        return;
      }

      // Body cap runs only after S2S passes so unauthenticated callers still get 401.
      const contentLength = Number(headerValue(req.headers['content-length']));
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: `Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`,
            },
            id: null,
          }),
        );
        return;
      }

      const handle = async () => {
        // SECURITY-CRITICAL invariant: this transport MUST stay stateless
        // (sessionIdGenerator: undefined + enableJsonResponse: true).
        // Per-request tenant credentials are carried in an AsyncLocalStorage
        // context opened by runWithCredentials() below. A stateless
        // request->single-response flow keeps the tool call inside that
        // context - switching to a stateful/SSE transport would let a
        // long-lived connection serve later messages under a stale/foreign
        // credential context.
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
          maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
        });
        res.on('close', () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
      };

      if (isGatewayMode) {
        const apiKey = headerValue(req.headers['x-alga-api-key']);
        const instanceUrl = headerValue(req.headers['x-alga-instance-url']);
        let tenantId = headerValue(req.headers['x-alga-tenant-id']);
        try {
          tenantId = validateTenantId(tenantId);
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (error as Error).message }));
          return;
        }
        if (!apiKey || !instanceUrl) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Missing required X-Alga-Api-Key or X-Alga-Instance-Url header.',
            }),
          );
          return;
        }
        try {
          await validateInstanceUrl(instanceUrl);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: new InstanceUrlError().message }));
          return;
        }
        await runWithCredentials({ apiKey, instanceUrl, tenantId }, handle);
        return;
      }

      // Env / single-tenant mode: tools resolve ALGA_* from the process
      // environment. S2S is still enforced when a secret is configured.
      await handle();
    };
    void route().catch(() => {
      logger.error('HTTP request failed');
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'Request failed.' }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      logger.info(`HTTP streaming server listening on ${host}:${port}`, {
        s2sEnforced: s2sSecret !== '',
      });
      resolve();
    });
  });

  return httpServer;
}

// Entry point. Vitest imports this module to call startHttpServer. Skip the
// CLI entrypoint there. `node dist/http.js` still starts HTTP or stdio.
if (process.env.VITEST !== 'true') {
  if (process.env.MCP_TRANSPORT === 'http') {
    startHttpServer().catch((error) => {
      logger.error('Fatal startup error', error);
      process.exit(1);
    });
  } else {
    await import('./index.js');
  }
}

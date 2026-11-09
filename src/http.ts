import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { runWithCredentials, setGatewayMode, validateTenantId } from './alga-client.js';
import { TOOL_TIERS_HEADER } from './config.js';
import { selectTools } from './tools/index.js';
import { errorType, logger } from './utils/logger.js';
import { MAX_REQUEST_BODY_BYTES } from './input-limits.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';
import {
  validateInstanceUrl,
  warnPrivateOverride,
  InstanceUrlError,
  parseInstanceUrl,
  privateInstancesAllowed,
} from './ssrf.js';

// Conduit service-to-service auth (gateway#377 parity). HTTP startup fails
// closed: an empty CONDUIT_S2S_SECRET, or a known placeholder, refuses to
// boot unless MCP_ALLOW_INSECURE_DEV=1 (placeholders never qualify), and that
// flag is itself refused unless NODE_ENV=development. A secret under 32
// characters also refuses. The bypass skips X-Gateway-S2S and binds 127.0.0.1 only. A configured secret
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

const SHORT_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET must be at least 32 characters. ' +
  'Generate one with `openssl rand -hex 32`.';

/** Placeholder-looking, a short pattern repeated (e.g. "aaaa..." or "abcabc..."), or low variety. Never echoes the value. */
function weakS2sSecretProblem(secret: string): string | null {
  if (/replace|changeme|change-me|placeholder|example|your-?secret/i.test(secret))
    return 'looks like a placeholder';
  if (/^(.{1,8}?)\1+$/.test(secret)) return 'is a repeated character pattern';
  if (new Set(secret).size < 8) return 'has too few distinct characters';
  return null;
}

const PRIVATE_IN_GATEWAY_ERROR =
  'Refusing to start HTTP transport: ALGA_ALLOW_PRIVATE_INSTANCE is not allowed with AUTH_MODE=gateway. ' +
  'It is a single-tenant sandbox override; unset it on any shared deployment.';

const INSECURE_DEV_NODE_ENV_ERROR =
  'Refusing to start HTTP transport: MCP_ALLOW_INSECURE_DEV requires NODE_ENV=development.';

const MIN_S2S_SECRET_LENGTH = 32;

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
  const devFlag = (process.env.MCP_ALLOW_INSECURE_DEV ?? '').trim().toLowerCase();
  if (
    devFlag !== '' &&
    devFlag !== '0' &&
    devFlag !== 'false' &&
    (process.env.NODE_ENV ?? '').trim().toLowerCase() !== 'development'
  ) {
    refuseStart(INSECURE_DEV_NODE_ENV_ERROR);
  }
  const secret = (process.env.CONDUIT_S2S_SECRET ?? '').trim();
  if (secret && KNOWN_PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    refuseStart(PLACEHOLDER_S2S_SECRET_ERROR);
  }
  if (secret.length > 0 && secret.length < MIN_S2S_SECRET_LENGTH) {
    refuseStart(SHORT_S2S_SECRET_ERROR);
  }
  const weak = secret ? weakS2sSecretProblem(secret) : null;
  if (weak) {
    refuseStart(
      `Refusing to start HTTP transport: CONDUIT_S2S_SECRET ${weak}. ` +
        'Generate one with `openssl rand -hex 32`.',
    );
  }
  if (secret) return secret;

  if (process.env.MCP_ALLOW_INSECURE_DEV === '1') {
    // error level so LOG_LEVEL=warn|error cannot hide the bypass.
    logger.error(INSECURE_DEV_WARNING);
    return '';
  }

  refuseStart(MISSING_S2S_SECRET_ERROR);
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

/** The request body, or null as soon as it passes the cap; the rest is never read. */
async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > MAX_REQUEST_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** MCP_ALLOWED_HOSTS as a set, or null when unset. Insecure dev defaults to loopback names. */
function parseAllowedHosts(
  raw: string | undefined,
  insecureDev: boolean,
): ReadonlySet<string> | null {
  const entries = (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length) return new Set(entries);
  // Without S2S, a DNS-rebinding page could reach loopback; its Host is never a loopback name.
  return insecureDev ? new Set(['127.0.0.1', 'localhost', '::1']) : null;
}

/** The Host header, with or without its port, must be in the allowlist when there is one. */
function hostAllowed(req: IncomingMessage, allowed: ReadonlySet<string> | null): boolean {
  if (!allowed) return true;
  const host = (req.headers.host ?? '').trim().toLowerCase();
  if (allowed.has(host)) return true;
  // "[::1]:8080" -> "::1" (stripping ":\d+" from "::1" would leave "::"); "name:8080" -> "name".
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(host);
  const withoutPort = bracketed ? bracketed[1] : host.replace(/:\d+$/, '');
  return withoutPort !== '' && allowed.has(withoutPort);
}

/** AUTH_MODE for HTTP: unset or empty is gateway; anything but gateway|env refuses to start. */
export function resolveAuthMode(): 'gateway' | 'env' {
  const raw = process.env.AUTH_MODE ?? '';
  const mode = raw.trim();
  if (mode === '') return 'gateway';
  if (mode === 'gateway' || mode === 'env') return mode;
  refuseStart(`AUTH_MODE must be 'gateway' or 'env'. Got ${JSON.stringify(raw.slice(0, 40))}.`);
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

/** AUTH_MODE=env serves one Alga instance from env, so a bad URL or missing key should fail at boot, not per call. */
function checkEnvCredentials(): void {
  try {
    parseInstanceUrl(process.env.ALGA_INSTANCE_URL ?? '');
  } catch {
    refuseStart(
      'Refusing to start HTTP transport in AUTH_MODE=env: ALGA_INSTANCE_URL must be the https:// address of the Alga instance.',
    );
  }
  if (!(process.env.ALGA_API_KEY ?? '').trim())
    refuseStart('Refusing to start HTTP transport in AUTH_MODE=env: ALGA_API_KEY is empty.');
}

export async function startHttpServer(): Promise<HttpServer> {
  const s2sSecret = resolveS2sSecret();
  const authMode = resolveAuthMode();
  selectTools();
  const isGatewayMode = authMode === 'gateway';
  // A shared gateway serves many tenants; the sandbox override must never reach it.
  if (isGatewayMode && privateInstancesAllowed()) refuseStart(PRIVATE_IN_GATEWAY_ERROR);
  if (!isGatewayMode) checkEnvCredentials();
  warnPrivateOverride();
  const port = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);
  const host = resolveListenHost(s2sSecret);
  const allowedHosts = parseAllowedHosts(process.env.MCP_ALLOWED_HOSTS, s2sSecret === '');
  setGatewayMode(isGatewayMode);

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

      if (!hostAllowed(req, allowedHosts)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Host header is not in MCP_ALLOWED_HOSTS.' }));
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

      // Stateless: GET would open a standalone SSE stream and DELETE ends a session
      // that never exists, so only POST reaches the transport.
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return jsonRpcError(
          res,
          405,
          -32000,
          'Method not allowed: this server is stateless; use POST.',
        );
      }

      // Body cap runs only after S2S passes so unauthenticated callers still get 401.
      // An oversized body closes the connection, so the client cannot keep streaming it.
      const tooLarge = () => {
        res.setHeader('Connection', 'close');
        jsonRpcError(res, 413, -32600, `Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`);
      };
      const contentLength = Number(headerValue(req.headers['content-length']));
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES)
        return tooLarge();

      // The body is parsed here so a JSON-RPC batch never reaches the transport:
      // the 2025-06 protocol has no batching, and one POST must cost one tool call.
      const text = await readBody(req);
      if (text === null) return tooLarge();
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(text);
      } catch {
        return jsonRpcError(res, 400, -32700, 'Parse error: Invalid JSON');
      }
      if (Array.isArray(parsedBody))
        return jsonRpcError(
          res,
          400,
          -32600,
          'Invalid Request: batches are not supported. Send one JSON-RPC message per request.',
        );

      const handle = async () => {
        // SECURITY-CRITICAL invariant: this transport MUST stay stateless
        // (sessionIdGenerator: undefined + enableJsonResponse: true).
        // Per-request tenant credentials are carried in an AsyncLocalStorage
        // context opened by runWithCredentials() below. A stateless
        // request->single-response flow keeps the tool call inside that
        // context - switching to a stateful/SSE transport would let a
        // long-lived connection serve later messages under a stale/foreign
        // credential context.
        // X-Conduit-Tool-Tiers can only narrow the container's tiers; present-but-empty means no tools.
        const rawTiers = req.headers[TOOL_TIERS_HEADER];
        const server = createServer(Array.isArray(rawTiers) ? rawTiers.join(',') : rawTiers);
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
        await transport.handleRequest(req, res, parsedBody);
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
    void route().catch((error: unknown) => {
      logger.error('HTTP request failed', { errorType: errorType(error) });
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

/**
 * Per-request credential scope. Gateway HTTP opens one AsyncLocalStorage
 * context per request from the X-Alga-* headers; once gateway mode is set,
 * the process environment is never read for credentials. Kept free of
 * imports so the logger can use it to redact the in-scope key.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface AlgaCredentials {
  instanceUrl: string;
  apiKey: string;
  tenantId?: string;
}

const credentials = new AsyncLocalStorage<AlgaCredentials>();

export const runWithCredentials = <T>(value: AlgaCredentials, fn: () => T): T =>
  credentials.run(value, fn);

// Set once by startHttpServer in gateway mode. Stdio never sets it, so it keeps env credentials.
let gatewayMode = false;
export const setGatewayMode = (on: boolean) => {
  gatewayMode = on;
};
export const isGatewayMode = () => gatewayMode;

export function getCredentials(): AlgaCredentials | null {
  const scoped = credentials.getStore();
  if (scoped) return scoped;
  if (gatewayMode) return null;
  const {
    ALGA_INSTANCE_URL: instanceUrl,
    ALGA_API_KEY: apiKey,
    ALGA_TENANT_ID: tenantId,
  } = process.env;
  return instanceUrl && apiKey ? { instanceUrl, apiKey, tenantId } : null;
}

/** The per-request (gateway) API key in scope, if any. Used by the logger to redact it exactly. */
export const scopedApiKey = (): string | undefined => credentials.getStore()?.apiKey || undefined;

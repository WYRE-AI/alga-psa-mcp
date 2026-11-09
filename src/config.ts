/**
 * Tool tiers. The container flags decide which tiers exist for the process
 * (read is always on; write and destructive need explicit opt-in), and
 * Conduit's X-Conduit-Tool-Tiers header can only narrow that set for one
 * request. The Conduit deployment leaves both flags off, so it serves read
 * tools only.
 */
export type Tier = 'read' | 'write' | 'destructive';

export const ALL_TIERS: readonly Tier[] = ['read', 'write', 'destructive'];

export const DEFAULT_TIERS: readonly Tier[] = ['read'];

/** Header Conduit may send to narrow (never widen) the enabled tiers for one request. */
export const TOOL_TIERS_HEADER = 'x-conduit-tool-tiers';

export const flagEnabled = (value?: string): boolean => /^(true|1)$/i.test((value ?? '').trim());
export const writesEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  flagEnabled(env.ALGA_ENABLE_WRITES);
export const destructiveEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  flagEnabled(env.ALGA_ENABLE_DESTRUCTIVE);
export const readOnlyMode = (env: NodeJS.ProcessEnv = process.env) =>
  flagEnabled(env.READ_ONLY_MODE);

/** Tiers this container serves, from ALGA_ENABLE_WRITES, ALGA_ENABLE_DESTRUCTIVE and READ_ONLY_MODE. */
export function configuredTiers(env: NodeJS.ProcessEnv = process.env): ReadonlySet<Tier> {
  const tiers = new Set<Tier>(DEFAULT_TIERS);
  if (readOnlyMode(env) || !writesEnabled(env)) return tiers;
  tiers.add('write');
  if (destructiveEnabled(env)) tiers.add('destructive');
  return tiers;
}

/**
 * Intersects the configured tiers with a per-request tier header. Unknown or
 * not-configured entries are dropped, so the header can only remove tiers.
 * A present header that names no configured tier (including an empty one)
 * yields an empty set (no tools), not the configured default.
 */
export function narrowTiers(
  configured: ReadonlySet<Tier>,
  header: string | undefined,
): ReadonlySet<Tier> {
  if (header === undefined) return configured;
  const requested = new Set(
    header
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
  return new Set(ALL_TIERS.filter((tier) => configured.has(tier) && requested.has(tier)));
}

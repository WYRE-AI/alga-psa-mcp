/**
 * Every tool in this server is a read (GET), so `read` is the only tier. The
 * tier machinery matches the rest of the fleet so Conduit's
 * X-Conduit-Tool-Tiers contract behaves the same here.
 */
export type Tier = 'read';

export const ALL_TIERS: readonly Tier[] = ['read'];

export const DEFAULT_TIERS: readonly Tier[] = ['read'];

/** Header Conduit may send to narrow (never widen) the enabled tiers for one request. */
export const TOOL_TIERS_HEADER = 'x-conduit-tool-tiers';

/**
 * Tiers this container serves, from ALGA_TOOL_TIERS (the fleet's
 * <VENDOR>_TOOL_TIERS contract). Unset or blank means DEFAULT_TIERS. An
 * unknown value throws, so a typo or a request for write tools fails loudly
 * at startup instead of being ignored.
 */
export function configuredTiers(env: NodeJS.ProcessEnv = process.env): ReadonlySet<Tier> {
  const tiers = new Set<Tier>();
  for (const part of (env.ALGA_TOOL_TIERS ?? '').split(',')) {
    const value = part.trim().toLowerCase();
    if (!value) continue;
    if (!(ALL_TIERS as readonly string[]).includes(value))
      throw new Error(
        `Invalid ALGA_TOOL_TIERS entry "${value.slice(0, 40)}". Allowed: ${ALL_TIERS.join(', ')}.`,
      );
    tiers.add(value as Tier);
  }
  return tiers.size ? tiers : new Set(DEFAULT_TIERS);
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

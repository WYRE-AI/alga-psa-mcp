import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent } from 'undici';
import { logger } from './utils/logger.js';

export class InstanceUrlError extends Error {
  constructor() { super('Invalid Alga instance URL or disallowed network address.'); }
}
export type Resolver = (hostname: string, options: { all: true }) => Promise<{ address: string; family: number }[]>;
export const privateInstancesAllowed = () => process.env.ALGA_ALLOW_PRIVATE_INSTANCE === 'true';
let warned = false;
export function warnPrivateOverride(): void {
  if (privateInstancesAllowed() && !warned) {
    warned = true;
    logger.error('SECURITY WARNING: ALGA_ALLOW_PRIVATE_INSTANCE=true permits private networks and unencrypted HTTP. Use only in a trusted sandbox.');
  }
}

/** Only public unicast destinations qualify; transition mechanisms must not hide private IPv4. */
export function isDisallowedAddress(address: string): boolean {
  try {
    const ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv4') return ip.range() !== 'unicast';
    const bytes = ip.toByteArray();
    // IPv4-compatible and mapped forms are rejected, regardless of their embedded address.
    if (bytes.slice(0, 12).every((b) => b === 0) ||
        (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 255 && bytes[11] === 255)) return true;
    if (bytes[0] === 0x20 && bytes[1] === 0x02) {
      return isDisallowedAddress(bytes.slice(2, 6).join('.'));
    }
    if (bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytes.slice(4, 12).every((b) => b === 0)) {
      return isDisallowedAddress(bytes.slice(12).join('.'));
    }
    return ip.range() !== 'unicast';
  } catch { return true; }
}

export function parseInstanceUrl(value: string, allowPrivate = privateInstancesAllowed()): URL {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if ((!allowPrivate && url.protocol !== 'https:') ||
        (allowPrivate && !['https:', 'http:'].includes(url.protocol)) ||
        !hostname || url.username || url.password || url.search || url.hash ||
        value.includes('?') || value.includes('#') || (url.pathname !== '/' && url.pathname !== '')) throw new InstanceUrlError();
    const normalized = hostname.toLowerCase().replace(/\.$/, '');
    if (!allowPrivate && (/^(localhost|internal|local)$|\.(localhost|internal|local)$/.test(normalized) ||
        (isIP(hostname) !== 0 && isDisallowedAddress(hostname)))) throw new InstanceUrlError();
    return url;
  } catch { throw new InstanceUrlError(); }
}

async function resolveSafe(hostname: string, allowPrivate: boolean, resolver: Resolver) {
  try {
    const addresses = await resolver(hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => !isIP(address) || (!allowPrivate && isDisallowedAddress(address)))) throw new InstanceUrlError();
    return addresses;
  } catch { throw new InstanceUrlError(); }
}
export async function validateInstanceUrl(value: string, allowPrivate = privateInstancesAllowed(), resolver: Resolver = lookup): Promise<URL> {
  const url = parseInstanceUrl(value, allowPrivate);
  await resolveSafe(url.hostname.replace(/^\[|\]$/g, ''), allowPrivate, resolver);
  return url;
}

/** Resolve again at socket creation and pass only checked addresses to the connector. */
export function createSafeLookup(allowPrivate = privateInstancesAllowed(), resolver: Resolver = lookup): LookupFunction {
  return (hostname, options, callback) => {
    resolveSafe(hostname, allowPrivate, resolver).then((addresses) => {
      const family = typeof options === 'object' ? options.family : options;
      const candidates = family === 4 || family === 6 ? addresses.filter((a) => a.family === family) : addresses;
      if (!candidates.length) { callback(new InstanceUrlError(), '', 0); return; }
      if (typeof options === 'object' && options.all) {
        // Node's all-address lookup overload is supported by undici's connector.
        (callback as unknown as (error: Error | null, result: typeof candidates) => void)(null, candidates);
      } else callback(null, candidates[0].address, candidates[0].family);
    }, () => callback(new InstanceUrlError(), '', 0));
  };
}
export function createInstanceAgent(allowPrivate = privateInstancesAllowed()): Agent {
  return new Agent({ connect: { lookup: createSafeLookup(allowPrivate) } });
}

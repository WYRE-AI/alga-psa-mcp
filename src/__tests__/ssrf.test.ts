import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createSafeLookup,
  isDisallowedAddress,
  parseInstanceUrl,
  validateInstanceUrl,
  warnPrivateOverride,
} from '../ssrf.js';
const resolvePublic = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const blocked = [
  '127.0.0.1',
  '127.10.2.3',
  '10.1.2.3',
  '172.16.0.1',
  '172.31.255.255',
  '192.168.1.1',
  '169.254.169.254',
  '169.254.0.1',
  '100.64.0.1',
  '100.127.255.255',
  '0.0.0.0',
  '0.2.3.4',
  '224.0.0.1',
  '239.255.255.255',
  '240.0.0.1',
  '255.255.255.255',
  '192.0.2.1',
  '198.18.0.1',
  '::1',
  '::',
  'fc00::1',
  'fdff::1',
  'fe80::1',
  'ff02::1',
  '::ffff:127.0.0.1',
  '::ffff:8.8.8.8',
  '::192.168.1.1',
  '::10.0.0.1',
  '64:ff9b::a00:1',
  '64:ff9b::c0a8:101',
  '64:ff9b::7f00:1',
  '2002:0a00:0001::1',
  '2002:c0a8:0101::1',
  '2002:7f00:0001::1',
  '2001:db8::1',
  'not-an-ip',
];
describe('address classification', () => {
  it.each(blocked)('blocks %s', (address) => expect(isDisallowedAddress(address)).toBe(true));
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.255.255',
    '172.32.0.1',
    '100.128.0.1',
    '2606:4700:4700::1111',
    '64:ff9b::808:808',
    '2002:0808:0808::1',
  ])('allows public %s', (address) => expect(isDisallowedAddress(address)).toBe(false));
});
describe('URL policy', () => {
  it.each([
    'http://psa.example.com',
    'ftp://psa.example.com',
    'file:///etc/passwd',
    'https://',
    'not-url',
    'https://user:pass@psa.example.com',
    'https://psa.example.com?a=1',
    'https://psa.example.com#x',
    'https://psa.example.com?',
    'https://psa.example.com#',
    'https://psa.example.com/path',
    'https://localhost',
    'https://a.localhost',
    'https://localhost.',
    'https://metadata.internal',
    'https://host.local',
    'https://127.1',
    'https://2130706433',
    'https://0x7f000001',
    'https://[::1]',
    'https://[::ffff:127.0.0.1]',
    'https://169.254.169.254',
  ])('rejects %s', async (value) => {
    await expect(validateInstanceUrl(value, false, resolvePublic)).rejects.toThrow(
      'The Alga instance URL',
    );
  });
  it('accepts public hosts with ports and normalizes the origin', async () => {
    expect(
      (await validateInstanceUrl('https://psa.example.com:8443/', false, resolvePublic)).origin,
    ).toBe('https://psa.example.com:8443');
    expect(resolvePublic).toHaveBeenCalledWith('psa.example.com', { all: true });
  });
  it.each(blocked.filter((a) => a !== 'not-an-ip'))('rejects DNS answer %s', async (address) => {
    await expect(
      validateInstanceUrl('https://psa.example.com', false, async () => [
        { address, family: address.includes(':') ? 6 : 4 },
      ]),
    ).rejects.toThrow('The Alga instance URL');
  });
  it('rejects mixed public/private answers even if public comes first', async () => {
    await expect(
      validateInstanceUrl('https://psa.example.com', false, async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]),
    ).rejects.toThrow();
  });
  it('rejects lookup failure and empty answers without disclosing errors', async () => {
    for (const resolve of [
      async () => [],
      async () => {
        throw new Error('sensitive');
      },
    ]) {
      await expect(validateInstanceUrl('https://psa.example.com', false, resolve)).rejects.toThrow(
        'The Alga instance URL',
      );
    }
  });
  it('permits private HTTP only with the env override', async () => {
    vi.stubEnv('ALGA_ALLOW_PRIVATE_INSTANCE', 'true');
    expect(parseInstanceUrl('http://localhost:8000').protocol).toBe('http:');
    await expect(
      validateInstanceUrl('http://localhost', true, async () => [
        { address: '127.0.0.1', family: 4 },
      ]),
    ).resolves.toBeInstanceOf(URL);
    for (const value of ['1', 'TRUE', 'yes', 'false']) {
      vi.stubEnv('ALGA_ALLOW_PRIVATE_INSTANCE', value);
      expect(() => parseInstanceUrl('http://localhost')).toThrow();
    }
  });
  it.each([
    'https://a:b@localhost',
    'http://localhost?x=1',
    'http://localhost#x',
    'file:///etc/passwd',
  ])('retains structural restrictions with override: %s', (value) => {
    expect(() => parseInstanceUrl(value, true)).toThrow();
  });
  it('warns loudly once for the sandbox override', () => {
    vi.stubEnv('ALGA_ALLOW_PRIVATE_INSTANCE', 'true');
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnPrivateOverride();
    warnPrivateOverride();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0][0]).toContain('SECURITY WARNING');
  });
});
function connectLookup(
  resolve: Parameters<typeof createSafeLookup>[1],
  all = false,
  allow = false,
): Promise<unknown> {
  return new Promise((done, reject) => {
    createSafeLookup(allow, resolve)(
      'psa.example.com',
      { family: 0, all },
      (error, address, family) =>
        error ? reject(error) : done(all ? address : { address, family }),
    );
  });
}
describe('socket DNS pinning', () => {
  it('blocks a rebinding answer after preflight passed', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await validateInstanceUrl('https://psa.example.com', false, resolve);
    await expect(connectLookup(resolve)).rejects.toThrow('The Alga instance URL');
    expect(resolve).toHaveBeenCalledTimes(2);
  });
  it('pins a checked numeric address to the connector', async () => {
    await expect(connectLookup(resolvePublic)).resolves.toEqual({
      address: '93.184.216.34',
      family: 4,
    });
  });
  it('checks every answer even when connector requests one', async () => {
    await expect(
      connectLookup(async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '::1', family: 6 },
      ]),
    ).rejects.toThrow();
  });
  it('returns checked addresses for auto family selection', async () => {
    await expect(connectLookup(resolvePublic, true)).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
  });
  it('allows private socket targets in sandbox mode', async () => {
    await expect(
      connectLookup(async () => [{ address: '127.0.0.1', family: 4 }], false, true),
    ).resolves.toEqual({ address: '127.0.0.1', family: 4 });
  });
});

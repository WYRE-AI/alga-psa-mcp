import { vi, beforeEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import { fetch } from 'undici';
vi.mock('node:dns/promises', async (original) => ({
  ...(await original<typeof import('node:dns/promises')>()),
  lookup: vi.fn(),
}));
vi.mock('undici', async (original) => ({
  ...(await original<typeof import('undici')>()),
  fetch: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lookup).mockImplementation(() => {
    throw new Error('Unexpected DNS lookup in offline test');
  });
  vi.mocked(fetch).mockImplementation(() => {
    throw new Error('Unexpected API fetch in offline test');
  });
});

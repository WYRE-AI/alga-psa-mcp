// The fleet's reusable release workflow (mcp-server-release.yml) rewrites
// server.json's packages[0].identifier to the pushed image tag, so the file
// must describe an OCI image with 0.0.0 placeholders, as in the templates.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

it('server.json declares the GHCR image with template placeholders', () => {
  const server = JSON.parse(read('server.json'));
  expect(server.version).toBe('0.0.0');
  expect(server.packages).toHaveLength(1);
  expect(server.packages[0]).toMatchObject({
    registryType: 'oci',
    identifier: 'ghcr.io/wyre-ai/alga-psa-mcp:0.0.0',
  });
  expect(server.packages[0]).not.toHaveProperty('version');
});

it('release.yml builds and scans an image on every push to main', () => {
  const workflow = read('.github/workflows/release.yml');
  expect(workflow).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n/m);
  expect(workflow).toContain(
    'WYRE-AI/reusable-workflows/.github/workflows/mcp-server-release.yml@508ef4ddcd19285d108423a27f44078a15451575',
  );
  expect(workflow).toContain('fail-on-severity: HIGH,CRITICAL');
});

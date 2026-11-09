# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `alga_teams_list` read tool (`GET /api/v1/teams`), bringing the catalog to 72 tools:
  42 read, 18 write and 12 destructive.
- `X-Conduit-Tool-Tiers` support: the header narrows the container's tiers for one
  request and can never widen them; a present but empty header exposes zero tools.
- Errors keep Alga's error code and the `x-request-id` response header when each is a
  plain token. Alga's free-text error message is still never returned.
- Template gates: ESLint, `lint:destructive`, `typecheck`, `smoke` (stdio, no network),
  `evals/` for mcp-assert, gitleaks, CODEOWNERS.

### Changed

- `page` is passed through as given (Alga has no page maximum); `limit` stays capped at 100.
- Upstream responses are capped at 4 MiB (was 5 MiB).
- Every path parameter is checked again just before it enters the URL, and the built URL
  must land on exactly `{instance-origin}/api/v1{path}`. Array query values are refused.
- The logger also redacts the per-request gateway API key.
- HTTP startup also refuses placeholder-looking, repeated-pattern and low-variety
  `CONDUIT_S2S_SECRET` values.
- Docker base image pinned by digest; CI runs on Node 22 and 24 with
  `npm ci --ignore-scripts`; the release workflow uses the current reusable pipeline
  with a HIGH/CRITICAL vulnerability gate and still has no push trigger.

## [0.1.0] - Initial draft (unreleased)

### Added

- 70 hand-written Alga PSA tools: 40 read, 18 write and 12 opt-in destructive.
- stdio and stateless HTTP transports with gateway S2S verification.
- Request-scoped credentials, DNS pinning, redirect refusal and bounded retries.
- Offline tests, Node 22 CI and a non-root Docker image.
- Manual-only release pending approval for the first publish.

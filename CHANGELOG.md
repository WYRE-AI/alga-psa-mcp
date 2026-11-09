# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `alga_teams_list` read tool (`GET /api/v1/teams`), bringing the catalog to 42 read tools.
- `X-Conduit-Tool-Tiers` support: the header narrows the container's tiers for one
  request and can never widen them; a present but empty header exposes zero tools.
- `ALGA_TOOL_TIERS`, the fleet's `<VENDOR>_TOOL_TIERS` setting. `read` is the only
  valid value; anything else refuses to start.
- Errors keep Alga's error code and the `x-request-id` response header when each is a
  plain token. Alga's free-text error message is still never returned.
- `alga-contract.test.ts`: each tool's query keys and enums are checked against the
  keys its Alga route reads, vendored from Alga's schemas and controllers.
- Template gates: ESLint, `lint:destructive`, `typecheck`, `smoke` (stdio, no network),
  `evals/` for mcp-assert, gitleaks, CODEOWNERS.

### Changed

- `page` is passed through as given (Alga has no page maximum); each tool's own schema
  bounds `limit`, and the client no longer rewrites `page` or `limit`.
- Upstream responses are capped at 1 MiB (was 5 MiB), and one process runs at most
  16 Alga calls at once; further calls fail fast with a retryable error.
- One 30-second deadline covers every attempt and wait of a tool call, a
  `Retry-After` over 5 seconds returns the error at once instead of retrying early,
  and a cancelled MCP request cancels the Alga call.
- An oversized list page is truncated by dropping rows from the end of `data`, keeping
  `pagination` and every other top-level field, so the result stays valid JSON and the
  model can still page. It is marked `truncated` with `returned_items`,
  `total_items_in_page` and a `truncation_hint`. Other oversized results are still cut
  as text with a truncation note.
- HTTP `/mcp` refuses JSON-RPC batch bodies before the MCP transport.
- Instance URLs on special-use names (`.test`, `.invalid`, `.example`, `.home.arpa`)
  are refused before DNS, and `168.63.129.16` (Azure platform) is a blocked address.
- The release workflow drops its `workflow_dispatch` trigger, matching the template.
- Every path parameter is checked again just before it enters the URL, and the built URL
  must land on exactly `{instance-origin}/api/v1{path}`. Array query values are refused.
- `alga_schedules_list` calls the paginated `GET /schedules/search` instead of
  `GET /schedules`, which returned every entry at once.
- `sort` is an enum of the columns each route's Alga service can order by (free-text
  sort reached `ORDER BY` unchecked on several routes, including users). `fields` is
  offered only on `alga_tickets_list`, as Alga's ticket field allowlist; the other 11
  lists ignored it. Enum and date formats from Alga's schemas are typed in the tool
  schemas.
- The logger also redacts the per-request gateway API key.
- HTTP startup also refuses placeholder-looking, repeated-pattern and low-variety
  `CONDUIT_S2S_SECRET` values, and in `AUTH_MODE=env` refuses a missing or invalid
  `ALGA_INSTANCE_URL` or an empty `ALGA_API_KEY`.
- `server.json` names the OCI image `ghcr.io/wyre-ai/alga-psa-mcp:0.0.0` with
  `0.0.0` placeholders, matching the fleet templates.
- Docker base image pinned by digest; CI runs on Node 22 and 24 with
  `npm ci --ignore-scripts`; the release workflow uses the current reusable pipeline
  with a HIGH/CRITICAL vulnerability gate and runs on every push to `main`.

### Removed

- All 18 write and 12 destructive tools, the `ALGA_ENABLE_WRITES`,
  `ALGA_ENABLE_DESTRUCTIVE` and `READ_ONLY_MODE` switches, and the HTTP client's
  ability to send anything but a `GET` without a body. The server is read-only.

### Fixed

- The release no longer loads `@semantic-release/changelog`. The fleet release workflow
  runs semantic-release without this repo's devDependencies, so the plugin could not be
  found and the first release failed. The plugin's output was never committed back, and
  this file is maintained by hand.
- `alga_projects_list` takes `status` as a project status ID (UUID) only. Alga's list
  compares it to a uuid column, so a status name such as `active` was a Postgres error
  and an Alga 500 that told the model to retry. Get IDs from `alga_statuses_list` with
  `type=project`.
- `alga_boards_list` takes `include_inactive` (Alga leaves inactive boards out without
  it, so sorting by `is_inactive` did nothing); `alga_statuses_list` and
  `alga_ticket_categories_list` take `search`; `alga_priorities_list` takes `item_type`.
- `alga_tickets_comments_list` no longer promises internal notes to every API key:
  Alga hides internal comments and threads from client-portal users.
- A truncated list's `truncation_hint` names a request the tool accepts. It always said
  to repeat with a smaller `limit`, which unpaginated tools such as
  `alga_projects_tasks_list` reject as an unknown argument. Tools that return
  everything at once now say to narrow the request, and `alga_tickets_comments_list`
  says which `offset` to continue from.
- An oversized `alga_search` reply drops rows from `data.results` and keeps `groups`,
  `totalCount` and `nextCursor`. It used to be cut as text, losing `nextCursor` first
  and leaving invalid JSON.
- HTTP `/mcp` answers every method but POST with 405 and `Allow: POST` after the S2S
  check. A signed GET used to open a standalone SSE stream that nothing closed, and
  DELETE returned 200.
- An HTTP body over the 256 KiB cap gets 413 and the connection is closed at once;
  the rest of the body was read and discarded, so an endless chunked body held the
  socket open.
- One connection (API key) runs at most 4 Alga calls at once, below the process-wide 16. A tenant whose instance answers slowly could hold all 16 slots for the
  30-second deadline and make every other tenant's calls fail.
- `MCP_ALLOWED_HOSTS` (opt-in `Host` allowlist, as in the fleet templates). In insecure
  dev it defaults to loopback names, so a DNS-rebinding page cannot reach a developer's
  unauthenticated server.
- `ALGA_ALLOW_PRIVATE_INSTANCE` is never honoured in gateway mode, and HTTP refuses to
  start with it in `AUTH_MODE=gateway`.
- `alga_tickets_search` sends the keys Alga's search reads (`query`, `fields`,
  comma-separated `client_ids`/`status_ids`/`priority_ids`/`assigned_to_ids`,
  `include_closed`, `limit`) and is no longer marked paginated.
- `alga_tickets_comments_list` uses Alga's `limit` and `offset`; `page` and
  `is_internal` were ignored.
- `alga_invoices_list` filters by `invoice_date_from`/`_to` and `due_date_from`/`_to`
  (`start_date`/`end_date` were ignored), with `status` as Alga's enum.
- `alga_assets_search` drops the array filters Alga cannot parse from a query string.
- `alga_statuses_list` filters by `type`; `alga_contracts_list` by `contract_name`,
  `is_active` and `has_plans` (`client_id`, `status` and `status_type` were ignored).
- Unpaginated routes (ticket time entries and assets, client locations, invoice items,
  contact search) no longer advertise pages.
- `external_id` and `external_parent_id` accept IDs such as `org/repo#42`.
- `alga_ticket_categories_list` pages: Alga's category service reads only `limit` and
  `offset`, so `page` 2 returned page 1 again. The server now sends
  `offset = (page - 1) × limit`, and sorting uses `sort_by`/`sort_order` (`sort` and
  `order` were ignored).
- `alga_tickets_comments_list` sends `limit` up to 200 unchanged; a global clamp cut
  it to 100.
- `alga_contracts_list` is described as client contracts; Alga excludes templates.
- Truncation and oversized-response messages no longer suggest `fields`.

## [0.1.0] - Initial draft (unreleased)

### Added

- 70 hand-written Alga PSA tools: 40 read, 18 write and 12 opt-in destructive.
- stdio and stateless HTTP transports with gateway S2S verification.
- Request-scoped credentials, DNS pinning, redirect refusal and bounded retries.
- Offline tests, Node 22 CI and a non-root Docker image.
- Manual-only release pending approval for the first publish.

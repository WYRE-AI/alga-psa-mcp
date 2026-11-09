# @wyre-ai/alga-psa-mcp

A read-only Apache-2.0 MCP server for Alga PSA, maintained by WYRE AI. It
exposes **42 curated, hand-written read tools** over stdio or stateless
Streamable HTTP. Every tool is a plain `GET` in the `read` tier; the server ships
no tool that creates, changes or deletes anything in Alga, and its HTTP client
cannot send any other method or a request body.

The tools and schemas in this repository are hand-written. No generated API specification or Alga implementation code is included.

## Least-privilege setup in Alga

1. Create a dedicated **internal user**, for example `ai-assistant`.
2. Assign a custom role with only the read permissions needed for tickets,
   clients, contacts, time, projects, assets, invoices and knowledge articles,
   plus read access to the lookup resources (boards, statuses, priorities,
   categories, services, contracts, users, teams) your tools use.
3. Under that user's **Profile → API Keys**, create an API key with an expiry.
   Keys get that user's role permissions. We haven't confirmed whether enterprise-edition agent keys behave differently, so treat the key as having everything its user can do.
4. Rotate by creating a new key, updating the deployment, and revoking the old key.

The server only reads, but Alga's role permissions still decide which records the
user can see, so keep the role read-only too.

## Connection and credentials

The REST client targets `{instance-origin}/api/v1`. Supply an origin such as
`https://psa.example.com` or `https://psa.example.com:8443`, with an optional `/api/v1` suffix (normalized to the origin), and no other path,
userinfo, query or fragment.

### Gateway HTTP

`AUTH_MODE` defaults to `gateway` for HTTP (unset or empty means gateway), and
only `gateway` or `env` is accepted; any other value refuses to start. Send these headers on every
request to `/mcp`:

| Header                 | Required                       | Meaning                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `X-Alga-Instance-Url`  | Yes                            | The https:// address you use to sign in to Alga, for example https://psa.example.com. A trailing / or /api/v1 is fine; leave off any other path. Works for Nine Minds–hosted and self-hosted instances. Self-hosted instances on a public https:// URL are supported; instances on private networks are not. |
| `X-Alga-Api-Key`       | Yes                            | API key for the Alga user this connection acts as. Create it in Alga under Profile → API Keys. The key gets that user's permissions, so use a dedicated user with a limited role.                                                                                                                            |
| `X-Alga-Tenant-Id`     | No                             | Optional. Leave blank unless Alga support asks for it. A wrong value makes every request fail.                                                                                                                                                                                                               |
| `X-Gateway-S2S`        | Yes, except insecure local dev | Timestamped gateway proof                                                                                                                                                                                                                                                                                    |
| `X-Conduit-Tool-Tiers` | No                             | Comma-separated tiers for this request. `read` is the only tier this server has. The header only narrows the tiers the container serves and never widens them. Absent means no narrowing; present but empty (or naming no served tier) means no tools at all.                                                |

Gateway mode **never falls back to environment credentials**, including the tenant
ID. Missing required credential headers return HTTP 401 JSON `{error: ...}`;
invalid or disallowed instance URLs return HTTP 400 JSON before MCP handling.
A tenant ID, when supplied, must be a UUID. Empty tenant values are ignored.
Credentials are isolated using AsyncLocalStorage. Each request gets its own MCP
server and stateless transport; no credential-bearing sessions persist. `/mcp`
accepts only POST: after the S2S check, any other method (including a GET for a
standalone SSE stream, or DELETE) gets HTTP 405 with `Allow: POST`.

Set a real `CONDUIT_S2S_SECRET` of at least 32 characters to start HTTP
(generate one with `openssl rand -hex 32`). The gateway proof has the form
`t=<unix-seconds>,v1=<hex-HMAC-SHA256>`, signing the literal `t=<unix-seconds>` with
the configured secret. Proofs outside a five-minute window are refused. Deploy
the vendor-specific derived S2S secret, not a shared gateway master secret.
Empty or shorter secrets fail startup, and common placeholders such as `changeme`, `secret`
and `replace-with-a-real-secret` are refused even in insecure dev mode. Values that look like
a placeholder, repeat a short pattern (`aaaa…`, `abcabc…`) or use fewer than 8 distinct
characters are refused too. The secret is never echoed in these errors.

`GET /health` is unauthenticated process liveness. It returns no credentials and
never queries Alga. All `/mcp` requests require S2S before credential extraction
or body-size handling. HTTP has no browser CORS allowance; use a trusted gateway.

### Standalone environment

Stdio always uses environment credentials. For standalone HTTP, set
`AUTH_MODE=env`; HTTP still requires S2S unless insecure development is enabled.
In `AUTH_MODE=env`, HTTP refuses to start unless `ALGA_INSTANCE_URL` is a valid
instance URL and `ALGA_API_KEY` is set. The server does not automatically load
`.env` files.

| Variable            | Default                                 | Purpose                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ALGA_INSTANCE_URL` | Required in standalone                  | The https:// address you use to sign in to Alga, for example https://psa.example.com. A trailing / or /api/v1 is fine; leave off any other path. Works for Nine Minds–hosted and self-hosted instances. Self-hosted instances on a public https:// URL are supported; instances on private networks are not. |
| `ALGA_API_KEY`      | Required in standalone                  | API key for the Alga user this connection acts as. Create it in Alga under Profile → API Keys. The key gets that user's permissions, so use a dedicated user with a limited role.                                                                                                                            |
| `ALGA_TENANT_ID`    | Unset                                   | Optional. Leave blank unless Alga support asks for it. A wrong value makes every request fail.                                                                                                                                                                                                               |
| `AUTH_MODE`         | HTTP: `gateway`; stdio: env credentials | HTTP only: `gateway` or `env`, anything else refuses to start. Stdio always uses env credentials                                                                                                                                                                                                             |
| `MCP_TRANSPORT`     | `stdio` (Docker: `http`)                | Transport when using the HTTP entry point                                                                                                                                                                                                                                                                    |
| `MCP_HTTP_PORT`     | `8080`                                  | HTTP listener port                                                                                                                                                                                                                                                                                           |
| `MCP_HTTP_HOST`     | `0.0.0.0` with S2S                      | Bind host; insecure dev forces `127.0.0.1`                                                                                                                                                                                                                                                                   |
| `MCP_ALLOWED_HOSTS` | Unset (insecure dev: loopback names)    | Optional comma-separated `Host` header allowlist for `/mcp` (with or without port); any other `Host` gets 403. Unset accepts any `Host`, except in insecure dev, where only `127.0.0.1`, `localhost` and `[::1]` are accepted, so a DNS-rebinding page cannot reach it                                       |
| `LOG_LEVEL`         | `info`                                  | `debug`, `info`, `warn`, `error`; logs use stderr                                                                                                                                                                                                                                                            |

### Flags

| Variable                      | Default | Behavior                                                                                                                                                                                                         |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALGA_TOOL_TIERS`             | `read`  | Comma-separated tiers the container serves (the fleet's `<VENDOR>_TOOL_TIERS` contract). `read` is the only valid value; anything else refuses to start                                                          |
| `ALGA_ALLOW_PRIVATE_INSTANCE` | Off     | Exactly `true` allows private/loopback destinations and HTTP, for stdio and `AUTH_MODE=env` sandboxes only. HTTP refuses to start with it in `AUTH_MODE=gateway`, and gateway mode never honours it              |
| `CONDUIT_S2S_SECRET`          | Unset   | Required for HTTP, at least 32 characters; never sent to Alga                                                                                                                                                    |
| `MCP_ALLOW_INSECURE_DEV`      | Off     | Exactly `1` permits HTTP without S2S only on loopback, and only with `NODE_ENV=development` (any other non-empty value other than `0` or `false` refuses to start without it); cannot bypass placeholder refusal |

A tool removed for one request by `X-Conduit-Tool-Tiers`, or a name the server
does not ship, is refused with the same unknown-tool error. Every tool carries
`readOnlyHint: true, destructiveHint: false`.

## SSRF policy and request safety

By default the instance must use HTTPS, with a hostname, optional port, and no
userinfo, paths other than `/api/v1` (with optional trailing slash), query or fragment. Private and special-use IP literals
are refused, as are special-use and internal names (`localhost`, `internal`,
`local`, `test`, `invalid`, `example` and their subdomains, and `*.home.arpa`),
before any DNS lookup. DNS resolution checks **every** returned address. It blocks
loopback, private, link-local (including metadata IPs), CGNAT, unspecified,
multicast, reserved and broadcast destinations; the Azure platform address
`168.63.129.16`; IPv6 local/multicast ranges; IPv4-mapped and compatible IPv6; and
NAT64/6to4 addresses embedding blocked IPv4 destinations.

An undici Agent resolves again when opening each socket and passes only checked
numeric addresses to the connector, preventing DNS rebinding between validation
and connection. TLS continues to verify the original hostname. Redirects are
never followed, including redirects to another public origin. The sandbox-only
`ALGA_ALLOW_PRIVATE_INSTANCE=true` override permits private networks and HTTP,
retains URL structural restrictions, and logs a loud warning once at startup. It
only works for stdio and `AUTH_MODE=env`: gateway mode ignores it, and HTTP in
gateway mode refuses to start while it is set. No request header can enable it.

Each tool call has one 30-second deadline that covers every attempt, wait and
body read, and it stops early if the MCP request is cancelled. HTTP 429 and
502/503/504 retry at most three times, honoring seconds or HTTP-date
`Retry-After` values up to 5 seconds; a longer `Retry-After`, or a retry whose
wait would pass the deadline, returns the error at once. Upstream responses are
read as a stream and capped at 1 MiB; a larger one is aborted with an error asking
you to narrow the request. One process runs at most 16 Alga calls at once, and one
connection (API key) at most 4; a call beyond either limit fails at once with a
retryable error, so a slow or hostile instance cannot exhaust the shared
container's memory or hold every slot while other tenants wait. HTTP `/mcp` refuses JSON-RPC batch
bodies (the 2025-06 protocol has none), so one request is at most one tool call.
Other failures become concise tool errors. From an Alga error we keep only its
code (for example `NOT_FOUND`) and the `x-request-id` response header, and only
when each is a plain token; Alga's error message, details and network exception
text are not returned.

Every path parameter is checked again just before it goes into the URL (no empty
value, `.`, `..`, `/`, `\`, encoded separators or dots, or control characters) and is
percent-encoded. The built URL must land on exactly `{instance-origin}/api/v1{path}`.
Query values are single scalars: Alga keeps one value per query key, so an array is
refused rather than sent as repeated or `key[]` parameters. Where Alga takes a
list (for example `client_ids` on ticket search or `types` on `alga_search`), the
tool takes one comma-separated string, which Alga splits.

Tool input uses closed schemas and bounded identifiers.
HTTP bodies are capped at 256 KiB, including chunked bodies; a body that passes the
cap gets HTTP 413 and the connection is closed without reading the rest. Tool arguments are capped
at 10,000 elements. Responses are compact JSON retaining data and pagination, capped
at 100 KiB. A list over the cap keeps its `pagination` and other top-level fields
and drops rows from the end of `data` (for `alga_search`, from `data.results`,
keeping `groups`, `totalCount` and `nextCursor`); it stays valid JSON and adds
`truncated: true`, `returned_items`, `total_items_in_page` and a `truncation_hint`
built from the tool's own arguments. Paginated tools and `alga_search` say to repeat
the request with a smaller limit, because the next page or cursor starts after the
rows left out; `alga_tickets_comments_list` says which `offset` to continue from; tools
that return everything at once say to narrow the request. Any other response over the
cap is cut as text and ends with a truncation note,
so narrow the query before parsing it as JSON. Known API keys
and S2S secrets are redacted from output. Logs go to stderr and are redacted,
including the per-request gateway API key.

## Untrusted content

Ticket subjects and comments, notes, names, descriptions and knowledge base text
can be written by clients and outside senders. Every successful tool result is
wrapped as `<untrusted-content nonce="...">...</untrusted-content nonce="...">`,
preceded by a notice that it is untrusted data and not instructions. The nonce is
random per response. The data inside is left unchanged (no HTML escaping), except
that anything resembling an `untrusted-content` marker is defused with a `‹`
so it cannot forge a closing tag. The truncation note, when present, stays inside
the envelope. Error messages are always our own fixed text plus, at most, Alga's
error code and request ID tokens; Alga's error messages are never forwarded.

## Running locally

Node 22 or newer is required; CI runs Node 22 and 24, and Docker uses Node 22.

```sh
npm ci --ignore-scripts
npm run lint              # ESLint + destructive-warning lint
npm run typecheck
npm run build
npm test                  # offline; DNS and fetch are mocked
npm run smoke             # spawns dist/index.js over stdio; no network
```

For stdio, set `ALGA_INSTANCE_URL`, `ALGA_API_KEY` and optional `ALGA_TENANT_ID`
in your MCP client's environment, then configure the command:

```json
{
  "mcpServers": {
    "alga": {
      "command": "node",
      "args": ["/absolute/path/to/alga-psa-mcp/dist/index.js"],
      "env": {
        "ALGA_INSTANCE_URL": "https://psa.example.com",
        "ALGA_API_KEY": "<service-user-api-key>"
      }
    }
  }
}
```

For local HTTP with credentials already exported in your shell:

```sh
NODE_ENV=development AUTH_MODE=env MCP_ALLOW_INSECURE_DEV=1 MCP_HTTP_HOST=127.0.0.1 npm run start:http
```

Leave `CONDUIT_S2S_SECRET` unset for this local-only bypass. Production must use
a real secret, a trusted gateway and TLS at the gateway ingress.

## Docker

```sh
docker build -t alga-psa-mcp:test .
# Export a securely generated CONDUIT_S2S_SECRET before starting.
docker run --rm -p 127.0.0.1:8080:8080 \
  -e CONDUIT_S2S_SECRET alga-psa-mcp:test
```

The image uses `node:22-alpine` pinned by digest, installs with `--ignore-scripts`,
runs as the non-root `alga` user, defaults to `AUTH_MODE=gateway` and
`ALGA_TOOL_TIERS=read`, and exposes port 8080. It refuses to start without valid S2S
configuration. Inject Alga credentials only via the per-request headers, and
restrict network ingress to the trusted gateway. The healthcheck uses `/health`.

To use the image over stdio, override its HTTP defaults:

```sh
docker run --rm -i -e MCP_TRANSPORT=stdio -e AUTH_MODE=env \
  -e ALGA_INSTANCE_URL -e ALGA_API_KEY -e ALGA_TENANT_ID alga-psa-mcp:test
```

## Tool catalog

Paginated list tools accept `page` (default 1) and `limit` (default 25, 1–100,
Alga's maximum). `page` is passed through as given (1 or more; Alga has no page
maximum). Every `limit` is bounded by its own tool's schema and sent unchanged.
Each call makes one request; the server never fetches further pages on its own.
`alga_ticket_categories_list` also takes `page`, but Alga's category service pages
by offset only, so the server sends `offset = (page - 1) × limit` with it, and it
sorts with `sort_by`/`sort_order`. `sort` is always an enum of the columns that
route's Alga service can order by; `alga_assets_list` offers only `order`, because
Alga's asset sort is not safe to drive by column name. `fields` (columns to return)
is offered only on `alga_tickets_list`, the one list Alga applies it to, as an enum
of Alga's allowed ticket fields. Date filters are typed: `YYYY-MM-DD` for calendar
dates and a UTC date-time such as `2026-03-01T00:00:00Z` for timestamps.

Search tools (`alga_tickets_search`, `alga_contacts_search`, `alga_assets_search`)
are not paginated: they return up to `limit` matches. `alga_tickets_comments_list`
uses Alga's `limit` (up to 200) and `offset`. `alga_search` uses Alga's cursor
pagination: pass the returned `nextCursor` as `cursor` with the same query, types
and sort. `alga_schedules_list` calls `GET /schedules/search`, the paginated twin of
`GET /schedules`, which returns every entry at once.

Identifiers are strings, at most 128 characters, matching `^[A-Za-z0-9_\-:.]+$`;
standalone `.` and `..` identifiers are refused. IDs from other systems
(`external_id`, `external_parent_id`) are only sent as query values and accept any
text up to 1,000 characters. Tool inputs expose path identifiers as `id` except
project phase lists, task lists and task status lists use `project_id`, phase
selection uses `phase_id`, and task get uses `task_id`.

Each tool's query keys are checked against the keys its Alga route actually reads
(`src/__tests__/alga-contract.test.ts`, vendored from Alga's schemas, controllers
and the service each controller calls), so a filter Alga would silently drop fails
the build. The same file checks how each list pages (page or offset), every sort
allowlist, and that each tool's maximum `limit` reaches Alga unchanged. Tests use mocked
responses and don't contact a live Alga instance.

Three Alga read endpoints are deliberately not separate tools.
`GET /api/v1/tickets/statuses` and `/tickets/priorities` overlap `alga_statuses_list`
and `alga_priorities_list`. `GET /api/v1/assets/{id}/summary` is left out because its
route handler never authenticates the API key (it calls a session-based server action),
so it is not expected to work with an API key.

Project phase lists, task lists and task status lists are not paginated. `alga_projects_tasks_list` takes `project_id` and optional `phase_id`.

### Read — 42 tools

| Tool                                      | Route                                             | Returns / key filters                                                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alga_assets_get`                         | `GET /assets/{id}`                                | Get one asset by ID. Use after a list or search to see full details.                                                                                                                                                                               |
| `alga_assets_list`                        | `GET /assets`                                     | List assets, one page at a time. Use to browse or filter by client, type, status or location; use alga_assets_search to find assets by text.                                                                                                       |
| `alga_assets_search`                      | `GET /assets/search`                              | Search assets by text and return up to limit matches (not paginated). To filter by client, type or status, use alga_assets_list instead.                                                                                                           |
| `alga_boards_list`                        | `GET /boards`                                     | List ticket boards, optionally filtered by name search, one page at a time.                                                                                                                                                                        |
| `alga_clients_contacts_list`              | `GET /clients/{id}/contacts`                      | List contacts belonging to one client, one page at a time. Use alga_contacts_list to browse across clients or alga_contacts_search to find a person by name or email.                                                                              |
| `alga_clients_get`                        | `GET /clients/{id}`                               | Get one client by ID. Use after a list or search to see full details.                                                                                                                                                                              |
| `alga_clients_list`                       | `GET /clients`                                    | List clients, one page at a time. Use to browse or filter by name search, type or inactive state.                                                                                                                                                  |
| `alga_clients_locations_list`             | `GET /clients/{id}/locations`                     | List all locations belonging to a client (not paginated).                                                                                                                                                                                          |
| `alga_contacts_get`                       | `GET /contacts/{id}`                              | Get one contact by ID. Use after a list or search to see full details.                                                                                                                                                                             |
| `alga_contacts_list`                      | `GET /contacts`                                   | List contacts, one page at a time. Use to browse or filter by client or inactive state; use alga_contacts_search to find a person by name or email.                                                                                                |
| `alga_contacts_search`                    | `GET /contacts/search`                            | Search contacts by name, email or other columns and return up to limit matches (not paginated). Optionally limit to one client or include inactive contacts.                                                                                       |
| `alga_contracts_list`                     | `GET /contracts`                                  | List client contracts, one page at a time (each has owner_client_id and owner_client_name); templates are not included. Filter by contract name, active state or whether a contract has plans. There is no per-client filter here.                 |
| `alga_invoices_get`                       | `GET /invoices/{id}`                              | Get one invoice by ID. Use after a list or search to see full details.                                                                                                                                                                             |
| `alga_invoices_items_list`                | `GET /invoices/{id}/items`                        | List all line items on an invoice (not paginated).                                                                                                                                                                                                 |
| `alga_invoices_list`                      | `GET /invoices`                                   | List invoices, one page at a time. Filter by client, status, invoice date range or due date range (YYYY-MM-DD, inclusive).                                                                                                                         |
| `alga_kb_articles_get`                    | `GET /kb-articles/{id}`                           | Get one knowledge article by ID. Use after a list or search to see full details.                                                                                                                                                                   |
| `alga_kb_articles_list`                   | `GET /kb-articles`                                | List knowledge articles, one page at a time. Use to browse or filter by search, category, type, audience or status.                                                                                                                                |
| `alga_priorities_list`                    | `GET /priorities`                                 | List priorities, one page at a time. Use to browse or filter by priority name search.                                                                                                                                                              |
| `alga_projects_get`                       | `GET /projects/{id}`                              | Get one project by ID. Use after a list or search to see full details.                                                                                                                                                                             |
| `alga_projects_list`                      | `GET /projects`                                   | List projects, one page at a time. Use to browse or filter by client, status or search.                                                                                                                                                            |
| `alga_projects_phases_list`               | `GET /projects/{project_id}/phases`               | List all phases in a project. This list is not paginated.                                                                                                                                                                                          |
| `alga_projects_task_status_mappings_list` | `GET /projects/{project_id}/task-status-mappings` | List the task statuses a project uses, in the order Alga shows them, with the ID Alga uses for each (project_status_mapping_id). Pass phase_id to get the statuses for one phase; if that phase has no statuses of its own, you get the project's. |
| `alga_projects_tasks_get`                 | `GET /projects/tasks/{task_id}`                   | Get one project task by ID. Use after a list or search to see full details.                                                                                                                                                                        |
| `alga_projects_tasks_list`                | `GET /projects/{project_id}/tasks`                | List all tasks in a project. Pass phase_id to list only one phase; get phase IDs from alga_projects_phases_list. These lists are not paginated.                                                                                                    |
| `alga_schedules_list`                     | `GET /schedules/search`                           | List schedule entries, one page at a time. Filter by user or date range.                                                                                                                                                                           |
| `alga_search`                             | `GET /search`                                     | Search across record types at once. Use when you don't know the record type; pass the returned nextCursor as cursor to get more results.                                                                                                           |
| `alga_services_list`                      | `GET /services`                                   | List services, one page at a time. Use to browse or filter by name search or category.                                                                                                                                                             |
| `alga_statuses_list`                      | `GET /statuses`                                   | List statuses, one page at a time. Filter by type (ticket, project, project_task or interaction). Ticket statuses belong to a board, so type=ticket also needs board_id.                                                                           |
| `alga_teams_list`                         | `GET /teams`                                      | List teams of users, one page at a time. Use to browse or filter by team name, manager or whether a team has a manager.                                                                                                                            |
| `alga_ticket_categories_list`             | `GET /categories/ticket`                          | List ticket categories, one page at a time. Use to browse or filter by board or parent category.                                                                                                                                                   |
| `alga_tickets_assets_list`                | `GET /tickets/{id}/assets`                        | List all assets linked to a ticket (not paginated).                                                                                                                                                                                                |
| `alga_tickets_comments_list`              | `GET /tickets/{id}/comments`                      | List comments on a ticket, internal notes included; each comment's is_internal flag says which. Use limit (up to 200) and offset to read long threads in parts.                                                                                    |
| `alga_tickets_get`                        | `GET /tickets/{id}`                               | Get one ticket by ID. Use after a list or search to see full details.                                                                                                                                                                              |
| `alga_tickets_get_by_external_link`       | `GET /tickets/by-external-link`                   | Get the ticket linked to a record in another system, using that system's name and the record's ID there.                                                                                                                                           |
| `alga_tickets_list`                       | `GET /tickets`                                    | List tickets, one page at a time. Use to browse or filter by client, board, status, priority, assignee, open or closed, dates or external link.                                                                                                    |
| `alga_tickets_search`                     | `GET /tickets/search`                             | Search tickets by text and return up to limit matches (not paginated). Closed tickets are left out unless include_closed is true. Narrow with comma-separated client, status, priority or assignee IDs.                                            |
| `alga_tickets_time_entries_list`          | `GET /tickets/{id}/time-entries`                  | Get the time logged on a ticket (not paginated). Users who can read every time sheet see all entries; others see their own entries plus a total for everyone else's.                                                                               |
| `alga_time_entries_get`                   | `GET /time-entries/{id}`                          | Get one time entry by ID. Use after a list or search to see full details.                                                                                                                                                                          |
| `alga_time_entries_list`                  | `GET /time-entries`                               | List time entries, one page at a time. Use to browse or filter by user, work item, dates or billable state.                                                                                                                                        |
| `alga_time_sheets_list`                   | `GET /time-sheets`                                | List time sheets, one page at a time. Use to browse or filter by user, period or approval state.                                                                                                                                                   |
| `alga_users_get`                          | `GET /users/{id}`                                 | Get one user profile by ID. Use after a list or search to see full details.                                                                                                                                                                        |
| `alga_users_list`                         | `GET /users`                                      | List users, one page at a time. Use to browse or filter by search or inactive state.                                                                                                                                                               |

## Development and licensing

`src/tools/<domain>.ts` contains the hand-written tool definitions and closed JSON
schemas. `src/tools/index.ts` holds the single tool inventory. Tests assert the
read-only contract (42 tools, every one a `GET` in the `read` tier), annotations,
excluded routes, tool-list size, each route's query keys against Alga's own
contract, wire requests, input limits, S2S behavior, SSRF protection, the retry
deadline and the template security contract (`src/__tests__/contract.test.ts`). No
test contacts Alga. CI (`ci.yml`) runs `npm ci --ignore-scripts`, lint, typecheck,
build, the destructive-warning lint, a `process.env` credential-mutation guard,
tests and the stdio smoke test on Node 22 and 24, plus a Docker build.
`mcp-assert.yml` runs the fleet baseline plus `evals/`, and `gitleaks.yml` scans
history.

`release.yml` calls the pinned fleet release pipeline. On pull requests and manual
dispatch it runs only the verify job; a push to `main` cuts a release, pushes
`ghcr.io/wyre-ai/alga-psa-mcp` and gates it on a HIGH/CRITICAL Trivy scan.
`server.json` names that OCI image with `0.0.0` placeholders, which the pipeline
fills in.

Apache-2.0; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
No Alga implementation code is included. Alga PSA is a trademark of Nine Minds.
This project is not affiliated with Nine Minds.

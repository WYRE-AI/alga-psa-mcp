# @wyre-ai/alga-psa-mcp

An Apache-2.0 MCP server for Alga PSA, maintained by WYRE Technology. It exposes
70 curated, hand-written tools over stdio or stateless Streamable HTTP: **40 read,
18 write, and 12 destructive**. Read and write tools are enabled by default;
destructive operations require an explicit environment flag.

This initial 0.1.0 draft is self-contained. Its small REST client will be replaced
by `@wyre-ai/node-alga-psa` after that package's first publish. There is no generated
tool code or API specification in this repository. Release is manual-only pending
Aaron's approval of the first publish.

## Least-privilege setup in Alga

1. Create a dedicated **internal user**, for example `conduit-mcp`.
2. Assign a custom role with only the read permissions needed for tickets,
   clients, contacts, time, projects, assets, invoices and knowledge articles.
   Add read access to lookup resources needed by your tools. If writes are
   wanted, start with write permission on tickets and time only; add other
   permissions individually when needed.
3. Under that user's **Profile → API Keys**, mint an API key with an expiry.
   Keys inherit the user's RBAC permissions; there are **no key scopes**.
4. Rotate by minting a new key, updating the deployment, and revoking the old key.

Tool flags narrow the available operations. Alga's RBAC remains the authority for
which records and operations a service user can access. Consider
`READ_ONLY_MODE=true` for initial deployments.

## Connection and credentials

The REST client targets `{instance-origin}/api/v1`. Supply an origin such as
`https://psa.example.com` or `https://psa.example.com:8443`, with no path prefix,
userinfo, query or fragment.

### Gateway HTTP

Set `AUTH_MODE=gateway`. Send these **proposed Conduit contract** headers on every
request to `/mcp`:

| Header | Required | Meaning |
| --- | --- | --- |
| `X-Alga-Instance-Url` | Yes | Alga instance origin |
| `X-Alga-Api-Key` | Yes | Secret service-user API key; forwarded as `x-api-key` |
| `X-Alga-Tenant-Id` | No | Forwarded as `x-tenant-id` |
| `X-Gateway-S2S` | Yes, except insecure local dev | Timestamped gateway proof |

Gateway mode **never falls back to environment credentials**, including the tenant
ID. Missing required credential headers return HTTP 401 JSON `{error: ...}`;
invalid or disallowed instance URLs return HTTP 400 JSON before MCP handling.
Credentials are isolated using AsyncLocalStorage. Each request gets its own MCP
server and stateless transport; no credential-bearing sessions persist.

Set a real `CONDUIT_S2S_SECRET` to start HTTP. The gateway proof has the form
`t=<unix-seconds>,v1=<hex-HMAC-SHA256>`, signing the literal `t=<unix-seconds>` with
the configured secret. Proofs outside a five-minute window are refused. Deploy
the vendor-specific derived S2S secret, not a shared gateway master secret.
Empty secrets fail startup, and common placeholders such as `changeme`, `secret`
and `replace-with-a-real-secret` are refused even in insecure dev mode.

`GET /health` is unauthenticated process liveness. It returns no credentials and
never queries Alga. All `/mcp` requests require S2S before credential extraction
or body-size handling. HTTP has no browser CORS allowance; use a trusted gateway.

### Standalone environment

Stdio defaults to environment credentials. For standalone HTTP, set
`AUTH_MODE=env`; HTTP still requires S2S unless insecure development is enabled.
The server does not automatically load `.env` files.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALGA_INSTANCE_URL` | Required in standalone | Alga instance origin |
| `ALGA_API_KEY` | Required in standalone | Secret API key |
| `ALGA_TENANT_ID` | Unset | Optional tenant ID |
| `AUTH_MODE` | `env` (Docker: `gateway`) | Credential source |
| `MCP_TRANSPORT` | `stdio` (Docker: `http`) | Transport when using the HTTP entry point |
| `MCP_HTTP_PORT` | `8080` | HTTP listener port |
| `MCP_HTTP_HOST` | `0.0.0.0` with S2S | Bind host; insecure dev forces `127.0.0.1` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`; logs use stderr |

### Flags

| Variable | Default | Behavior |
| --- | --- | --- |
| `ALGA_ENABLE_DESTRUCTIVE` | Off | Only `true` or `1` (case insensitive) enables destructive tools |
| `READ_ONLY_MODE` | Off | Only `true` or `1` exposes read tools alone; wins over destructive enablement |
| `ALGA_ALLOW_PRIVATE_INSTANCE` | Off | Exactly `true` allows private/loopback destinations and HTTP; environment only |
| `CONDUIT_S2S_SECRET` | Unset | Required real secret for HTTP; never sent to Alga |
| `MCP_ALLOW_INSECURE_DEV` | Off | Exactly `1` permits HTTP without S2S only on loopback; cannot bypass placeholder refusal |

Disabled tools are absent from `tools/list` and rejected if called by name.
Read tools carry `readOnlyHint: true, destructiveHint: false`. Write tools carry
both hints false. Destructive tools carry `destructiveHint: true` and a warning
prefix in their descriptions. These hints supplement server-side enforcement.

## SSRF policy and request safety

By default the instance must use HTTPS, with a hostname, optional port, and no
userinfo, path prefix, query or fragment. Private and special-use IP literals
are refused, as are `localhost`, `*.localhost`, `*.internal` and `*.local` names.
DNS resolution checks **every** returned address. It blocks loopback, private,
link-local (including metadata IPs), CGNAT, unspecified, multicast, reserved and
broadcast destinations; IPv6 local/multicast ranges; IPv4-mapped and compatible
IPv6; and NAT64/6to4 addresses embedding blocked IPv4 destinations.

An undici Agent resolves again when opening each socket and passes only checked
numeric addresses to the connector, preventing DNS rebinding between validation
and connection. TLS continues to verify the original hostname. Redirects are
never followed, including redirects to another public origin. The sandbox-only
`ALGA_ALLOW_PRIVATE_INSTANCE=true` override permits private networks and HTTP,
retains URL structural restrictions, and logs a loud warning once at startup.
No request header can enable it.

Requests time out after 30 seconds per attempt. HTTP 429 retries at most three
times, honoring seconds or HTTP-date `Retry-After` values with a 60-second cap.
GET/PUT/DELETE also retry 502/503/504. POST retries only 429. Other failures become
concise tool errors; upstream error bodies and network exception details are not
returned. Do not assume a timed-out write failed to reach Alga; inspect the record
before repeating it.

Tool input uses closed schemas, explicit write fields and bounded identifiers.
HTTP bodies are capped at 256 KiB, including chunked bodies, and tool arguments
at 10,000 elements. Responses are compact JSON retaining data and pagination;
text above approximately 100 KiB ends with a truncation note. A truncated response
is a text preview, so narrow the query before parsing it as JSON. Known API keys
and S2S secrets are redacted from output; logs are restricted and redacted.

## Running locally

Node 20.19+ works in the local development environment; CI and Docker use Node 22.
The package declares `engines.node >=20`.

```sh
npm ci
npm run lint
npm run build
npm test
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
        "ALGA_API_KEY": "<service-user-api-key>",
        "READ_ONLY_MODE": "true"
      }
    }
  }
}
```

For local HTTP with credentials already exported in your shell:

```sh
AUTH_MODE=env MCP_ALLOW_INSECURE_DEV=1 MCP_HTTP_HOST=127.0.0.1 npm run start:http
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

The image uses `node:22-alpine`, runs as the non-root `alga` user, defaults to
`AUTH_MODE=gateway`, and exposes port 8080. It refuses to start without valid S2S
configuration. Inject Alga credentials only via the per-request headers, and
restrict network ingress to the trusted gateway. The healthcheck uses `/health`.
For sandbox targets, explicitly pass `-e ALGA_ALLOW_PRIVATE_INSTANCE=true`.

To use the image over stdio, override its HTTP defaults:

```sh
docker run --rm -i -e MCP_TRANSPORT=stdio -e AUTH_MODE=env \
  -e ALGA_INSTANCE_URL -e ALGA_API_KEY -e ALGA_TENANT_ID alga-psa-mcp:test
```

## Tool catalog

All list tools accept `page` (default 1), `limit` (default 25), `sort`, `order`
(`asc`/`desc`) and comma-separated `fields` projection, plus the filters in their
schemas. Page and limit are bounded to 1–100; the client also clamps them.
`alga_search` uses the API's documented cursor pagination: pass the returned
`nextCursor` as `cursor` with the same query/types/sort. It does not use page/order.
Identifiers are strings, at most 128 characters, matching `^[A-Za-z0-9_\-:.]+$`;
standalone `.` and `..` identifiers are refused. Tool inputs expose path identifiers
as `id` except project task `taskId` and phase `phaseId`.

Resource filters are optional and intentionally permissive. Endpoint and field
names were checked against the scope inventory and permitted API documentation;
filter behavior still needs verification against a live CE instance. Tests mock
all vendor HTTP and DNS; they do not claim live-instance validation.

### Read — 40 tools

| Tool | Returns / key filters |
| --- | --- |
| `alga_assets_get` | Return one asset by ID. |
| `alga_assets_list` | Return a page of assets; filter by client, type, status, location or search. |
| `alga_assets_search` | Return assets matching a query; narrow by client, type, status or location. |
| `alga_boards_list` | Return a page of ticket boards, optionally filtered by name search. |
| `alga_clients_contacts_list` | Return a page of contacts belonging to a client. |
| `alga_clients_get` | Return one client by ID. |
| `alga_clients_list` | Return a page of clients; filter by name search, type or inactive state. |
| `alga_clients_locations_list` | Return a page of locations belonging to a client. |
| `alga_contacts_get` | Return one contact by ID. |
| `alga_contacts_list` | Return a page of contacts; filter by client, search or inactive state. |
| `alga_contacts_search` | Return contacts matching a query, optionally within a client. |
| `alga_contracts_list` | Return a page of contracts; filter by client, status or search. |
| `alga_invoices_get` | Return one invoice by ID. |
| `alga_invoices_items_list` | Return a page of line items on an invoice. |
| `alga_invoices_list` | Return a page of invoices; filter by client, status or date range. |
| `alga_kb_articles_get` | Return one knowledge article by ID. |
| `alga_kb_articles_list` | Return a page of knowledge articles; filter by search, category, audience or status. |
| `alga_priorities_list` | Return a page of priorities; filter by priority name search. |
| `alga_projects_get` | Return one project by ID. |
| `alga_projects_list` | Return a page of projects; filter by client, status or search. |
| `alga_projects_phases_list` | Return a page of phases in a project. |
| `alga_projects_task_get` | Return one project task by task ID. |
| `alga_projects_tasks_list` | Return a page of project tasks; filter by phase or assignee. |
| `alga_schedules_list` | Return a page of schedule entries; filter by user, work item or date range. |
| `alga_search` | Return cross-resource search results and a next cursor; filter by types and sort by relevance or recent. |
| `alga_services_list` | Return a page of services; filter by name search or category. |
| `alga_statuses_list` | Return a page of statuses; filter by board or status type. |
| `alga_ticket_categories_list` | Return a page of ticket categories; filter by board or parent category. |
| `alga_tickets_assets_list` | Return a page of assets linked to a ticket. |
| `alga_tickets_comments_list` | Return ticket comments; optionally filter internal notes. |
| `alga_tickets_find_by_external_link` | Return the ticket matching an external system and external ID. |
| `alga_tickets_get` | Return one ticket by ID. |
| `alga_tickets_list` | Return a page of tickets; filter by client, board, status, assignee, dates or external link. |
| `alga_tickets_search` | Return matching tickets by query; narrow by client, board, status or assignee. |
| `alga_tickets_time_entries_list` | Return a page of time entries linked to a ticket. |
| `alga_time_entries_get` | Return one time entry by ID. |
| `alga_time_entries_list` | Return a page of time entries; filter by user, work item, dates or billable state. |
| `alga_time_sheets_list` | Return a page of time sheets; filter by user, period or approval state. |
| `alga_users_get` | Return one user profile by ID. |
| `alga_users_list` | Return a page of users; filter by search or inactive state. |

### Write — 18 tools

| Tool | Effect / returned result |
| --- | --- |
| `alga_assets_create` | Create and return an asset with a client, type, tag, name and status. |
| `alga_assets_update` | Update explicit asset inventory fields and return the asset. |
| `alga_clients_create` | Create and return a client with a name and billing cycle. |
| `alga_clients_update` | Update explicit client profile fields and return the client. |
| `alga_contacts_create` | Create and return a contact with a full name and email. |
| `alga_contacts_update` | Update explicit contact fields and return the contact. |
| `alga_kb_articles_create` | Create and return a draft knowledge article; this tool never publishes. |
| `alga_projects_tasks_create` | Create and return a task in a project phase with a status mapping. |
| `alga_projects_tasks_update` | Update explicit project task fields and return the task. |
| `alga_schedules_create` | Create and return a schedule entry with start/end times and optional assigned users. |
| `alga_tickets_checklist_add` | Add a named checklist item to a ticket and return the item. |
| `alga_tickets_comments_add` | Add a ticket comment or internal note and return the comment. |
| `alga_tickets_create` | Create and return a ticket with client, board, priority and status references. |
| `alga_tickets_update` | Update explicit ticket fields and return the ticket. |
| `alga_tickets_update_assignment` | Set the primary ticket assignee and return the updated ticket. |
| `alga_tickets_update_status` | Set a ticket status and return the updated ticket. |
| `alga_time_entries_create` | Create and return a time entry for a work item, service and time interval. |
| `alga_time_entries_update` | Update explicit time entry fields and return the entry. |

### Destructive — 12 tools (off by default)

| Tool | Effect / returned result |
| --- | --- |
| `alga_assets_delete` | ⚠ DESTRUCTIVE: Delete an asset by ID; return the deletion result. |
| `alga_clients_delete` | ⚠ DESTRUCTIVE: Delete a client by ID; return the deletion result. |
| `alga_clients_merge` | ⚠ DESTRUCTIVE: Permanently absorb source client id into target_client_id; return the merge result. |
| `alga_contacts_delete` | ⚠ DESTRUCTIVE: Delete a contact by ID; return the deletion result. |
| `alga_invoices_finalize` | ⚠ DESTRUCTIVE: Finalize an invoice, committing its billing state; return the result. |
| `alga_invoices_send` | ⚠ DESTRUCTIVE: Email the invoice to the client; return the delivery result. |
| `alga_projects_delete` | ⚠ DESTRUCTIVE: Delete a project by ID; return the deletion result. |
| `alga_projects_tasks_delete` | ⚠ DESTRUCTIVE: Delete a project task by task ID; return the deletion result. |
| `alga_schedules_delete` | ⚠ DESTRUCTIVE: Delete a schedule entry by ID; return the deletion result. |
| `alga_tickets_delete` | ⚠ DESTRUCTIVE: Delete a ticket by ID; return the deletion result. |
| `alga_time_entries_delete` | ⚠ DESTRUCTIVE: Delete a time entry by ID; return the deletion result. |
| `alga_time_sheets_approve` | ⚠ DESTRUCTIVE: Approve a time sheet for billing/payroll; return the approval result. |

Knowledge article creation always sends draft status and offers no publish input.
Invoice sending emails the invoice to the client. Finalization, time-sheet
approval, client merges and deletion tools can have lasting operational effects;
enable destructive tools only for connections intended to perform those actions.

## Development and licensing

`src/tools/<domain>.ts` contains the hand-written tool definitions and closed JSON
schemas. `src/tools/index.ts` holds the single tool inventory. Tests assert exact
tier counts, annotations, excluded routes, tool-list size, wire requests, input
limits, S2S behavior, SSRF protection and retry policy. No test contacts Alga.
CI runs install, lint, build and tests on Node 22 plus a separate Docker build.
The release workflow only supports manual dispatch; no push or PR triggers a
release. Nothing has been published as part of this initial build.

Apache-2.0; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
No Alga implementation code is included. Alga PSA is a trademark of Nine Minds.
This project is not affiliated with Nine Minds.

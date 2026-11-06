# @wyre-ai/alga-psa-mcp

An Apache-2.0 MCP server for Alga PSA, maintained by WYRE AI. It exposes
71 curated, hand-written tools over stdio or stateless Streamable HTTP: **41 read,
18 write, and 12 destructive**. Only the 41 read tools are enabled by default.
`ALGA_ENABLE_WRITES=true` adds the 18 write tools (59 in total), and
`ALGA_ENABLE_DESTRUCTIVE=true` on top of that adds the 12 destructive tools (71).

The tools and schemas in this repository are hand-written. No generated API specification or Alga implementation code is included.

## Least-privilege setup in Alga

1. Create a dedicated **internal user**, for example `ai-assistant`.
2. Assign a custom role with only the read permissions needed for tickets,
   clients, contacts, time, projects, assets, invoices and knowledge articles.
   Add read access to lookup resources needed by your tools. If writes are
   wanted, start with write permission on tickets and time only; add other
   permissions individually when needed.
3. Under that user's **Profile → API Keys**, create an API key with an expiry.
   Keys get that user's role permissions. We haven't confirmed whether enterprise-edition agent keys behave differently, so treat the key as having everything its user can do.
4. Rotate by creating a new key, updating the deployment, and revoking the old key.

Tool flags narrow the available operations. Alga's role permissions still decide which records and actions the user can reach. Writes are off by default;
turn them on only for connections that need them. `READ_ONLY_MODE=true` forces read tools only, even if writes are enabled.

## Connection and credentials

The REST client targets `{instance-origin}/api/v1`. Supply an origin such as
`https://psa.example.com` or `https://psa.example.com:8443`, with an optional `/api/v1` suffix (normalized to the origin), and no other path,
userinfo, query or fragment.

### Gateway HTTP

`AUTH_MODE` defaults to `gateway` for HTTP (unset or empty means gateway), and
only `gateway` or `env` is accepted; any other value refuses to start. Send these headers on every
request to `/mcp`:

| Header                | Required                       | Meaning                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `X-Alga-Instance-Url` | Yes                            | The https:// address you use to sign in to Alga, for example https://psa.example.com. A trailing / or /api/v1 is fine; leave off any other path. Works for Nine Minds–hosted and self-hosted instances. Self-hosted instances on a public https:// URL are supported; instances on private networks are not. |
| `X-Alga-Api-Key`      | Yes                            | API key for the Alga user this connection acts as. Create it in Alga under Profile → API Keys. The key gets that user's permissions, so use a dedicated user with a limited role.                                                                                                                            |
| `X-Alga-Tenant-Id`    | No                             | Optional. Leave blank unless Alga support asks for it. A wrong value makes every request fail.                                                                                                                                                                                                               |
| `X-Gateway-S2S`       | Yes, except insecure local dev | Timestamped gateway proof                                                                                                                                                                                                                                                                                    |

Gateway mode **never falls back to environment credentials**, including the tenant
ID. Missing required credential headers return HTTP 401 JSON `{error: ...}`;
invalid or disallowed instance URLs return HTTP 400 JSON before MCP handling.
A tenant ID, when supplied, must be a UUID. Empty tenant values are ignored.
Credentials are isolated using AsyncLocalStorage. Each request gets its own MCP
server and stateless transport; no credential-bearing sessions persist.

Set a real `CONDUIT_S2S_SECRET` of at least 32 characters to start HTTP
(generate one with `openssl rand -hex 32`). The gateway proof has the form
`t=<unix-seconds>,v1=<hex-HMAC-SHA256>`, signing the literal `t=<unix-seconds>` with
the configured secret. Proofs outside a five-minute window are refused. Deploy
the vendor-specific derived S2S secret, not a shared gateway master secret.
Empty or shorter secrets fail startup, and common placeholders such as `changeme`, `secret`
and `replace-with-a-real-secret` are refused even in insecure dev mode.

`GET /health` is unauthenticated process liveness. It returns no credentials and
never queries Alga. All `/mcp` requests require S2S before credential extraction
or body-size handling. HTTP has no browser CORS allowance; use a trusted gateway.

### Standalone environment

Stdio always uses environment credentials. For standalone HTTP, set
`AUTH_MODE=env`; HTTP still requires S2S unless insecure development is enabled.
The server does not automatically load `.env` files.

The write tools stay off unless `ALGA_ENABLE_WRITES=true`. It's set once per container and applies to every connection that container serves.

| Variable            | Default                                 | Purpose                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ALGA_INSTANCE_URL` | Required in standalone                  | The https:// address you use to sign in to Alga, for example https://psa.example.com. A trailing / or /api/v1 is fine; leave off any other path. Works for Nine Minds–hosted and self-hosted instances. Self-hosted instances on a public https:// URL are supported; instances on private networks are not. |
| `ALGA_API_KEY`      | Required in standalone                  | API key for the Alga user this connection acts as. Create it in Alga under Profile → API Keys. The key gets that user's permissions, so use a dedicated user with a limited role.                                                                                                                            |
| `ALGA_TENANT_ID`    | Unset                                   | Optional. Leave blank unless Alga support asks for it. A wrong value makes every request fail.                                                                                                                                                                                                               |
| `AUTH_MODE`         | HTTP: `gateway`; stdio: env credentials | HTTP only: `gateway` or `env`, anything else refuses to start. Stdio always uses env credentials                                                                                                                                                                                                             |
| `MCP_TRANSPORT`     | `stdio` (Docker: `http`)                | Transport when using the HTTP entry point                                                                                                                                                                                                                                                                    |
| `MCP_HTTP_PORT`     | `8080`                                  | HTTP listener port                                                                                                                                                                                                                                                                                           |
| `MCP_HTTP_HOST`     | `0.0.0.0` with S2S                      | Bind host; insecure dev forces `127.0.0.1`                                                                                                                                                                                                                                                                   |
| `LOG_LEVEL`         | `info`                                  | `debug`, `info`, `warn`, `error`; logs use stderr                                                                                                                                                                                                                                                            |

### Flags

| Variable                      | Default | Behavior                                                                                                                                                                                                         |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALGA_ENABLE_WRITES`          | Off     | Only `true` or `1` (case insensitive) enables write tools; container-wide                                                                                                                                        |
| `ALGA_ENABLE_DESTRUCTIVE`     | Off     | Only `true` or `1` enables destructive tools, and only when `ALGA_ENABLE_WRITES` is also on                                                                                                                      |
| `READ_ONLY_MODE`              | Off     | Only `true` or `1` exposes read tools alone; wins over write and destructive enablement                                                                                                                          |
| `ALGA_ALLOW_PRIVATE_INSTANCE` | Off     | Exactly `true` allows private/loopback destinations and HTTP; environment only. Deployment-wide: applies to every tenant and connection the container serves. Never set it on a shared gateway deployment        |
| `CONDUIT_S2S_SECRET`          | Unset   | Required for HTTP, at least 32 characters; never sent to Alga                                                                                                                                                    |
| `MCP_ALLOW_INSECURE_DEV`      | Off     | Exactly `1` permits HTTP without S2S only on loopback, and only with `NODE_ENV=development` (any other non-empty value other than `0` or `false` refuses to start without it); cannot bypass placeholder refusal |

Disabled tools are absent from `tools/list` and rejected if called by name.
Read tools carry `readOnlyHint: true, destructiveHint: false`. Write tools carry
both hints false. Destructive tools carry `destructiveHint: true` and a warning
prefix in their descriptions. These hints supplement server-side enforcement.

## SSRF policy and request safety

By default the instance must use HTTPS, with a hostname, optional port, and no
userinfo, paths other than `/api/v1` (with optional trailing slash), query or fragment. Private and special-use IP literals
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
It is a deployment-wide switch: it applies to every tenant and connection the
container serves, so never set it on a shared gateway deployment. Self-hosted
Alga on a public https URL is supported; instances on private networks are out
of scope for now. No request header can enable it.

Requests time out after 30 seconds per attempt. For GET and DELETE, HTTP 429
retries at most three times, honoring seconds or HTTP-date `Retry-After` values
with a 60-second cap. POST and PUT never retry a 429, because the change may
already have been saved. GET/PUT/DELETE retry 502/503/504; POST never retries
5xx. Upstream responses are read as a stream and capped at 5 MiB; a larger one
is aborted with an error asking you to narrow the request. Other failures become
concise tool errors; upstream error bodies and network exception details are not
returned. Do not assume a timed-out write failed to reach Alga; inspect the record
before repeating it.

Tool input uses closed schemas, explicit write fields and bounded identifiers.
HTTP bodies are capped at 256 KiB, including chunked bodies, and tool arguments
at 10,000 elements. Responses are compact JSON retaining data and pagination;
text above approximately 100 KiB ends with a truncation note. A truncated response
is a text preview, so narrow the query before parsing it as JSON. Known API keys
and S2S secrets are redacted from output; logs are restricted and redacted.

## Untrusted content

Ticket subjects and comments, notes, names, descriptions and knowledge base text
can be written by clients and outside senders. Every successful tool result is
wrapped as `<untrusted-content nonce="...">...</untrusted-content nonce="...">`,
preceded by a notice that it is untrusted data and not instructions. The nonce is
random per response. The data inside is left unchanged (no HTML escaping), except
that anything resembling an `untrusted-content` marker is defused with a `‹`
so it cannot forge a closing tag. The truncation note, when present, stays inside
the envelope. Error messages are always our own fixed text; Alga's error bodies are
never forwarded.

## Running locally

Node 22 or newer is required; CI and Docker use Node 22.

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

The image uses `node:22-alpine`, runs as the non-root `alga` user, defaults to
`AUTH_MODE=gateway`, and exposes port 8080. It refuses to start without valid S2S
configuration. Inject Alga credentials only via the per-request headers, and
restrict network ingress to the trusted gateway. The healthcheck uses `/health`.
Writes stay off unless you pass `-e ALGA_ENABLE_WRITES=true`.
For a dedicated sandbox container only, pass `-e ALGA_ALLOW_PRIVATE_INSTANCE=true`; it applies to every connection that container serves.

To use the image over stdio, override its HTTP defaults:

```sh
docker run --rm -i -e MCP_TRANSPORT=stdio -e AUTH_MODE=env \
  -e ALGA_INSTANCE_URL -e ALGA_API_KEY -e ALGA_TENANT_ID alga-psa-mcp:test
```

## Tool catalog

Paginated list tools accept `page` (default 1), `limit` (default 25), `sort`, `order`
(`asc`/`desc`) and comma-separated `fields` projection, plus the filters in their
schemas. Page and limit are bounded to 1–100; the client also clamps them.
`alga_search` uses the API's documented cursor pagination: pass the returned
`nextCursor` as `cursor` with the same query/types/sort. It does not use page/order.
Identifiers are strings, at most 128 characters, matching `^[A-Za-z0-9_\-:.]+$`;
standalone `.` and `..` identifiers are refused. Tool inputs expose path identifiers
as `id` except project phase lists, task lists, task creation and task status lists use
`project_id`, phase selection uses `phase_id`, and task get/update/delete use `task_id`.

Resource filters are optional. Filter behavior can vary by Alga version, so check results against your instance. Tests use mocked responses and don't contact a live Alga instance.

Project phase lists, task lists and task status lists are not paginated. `alga_projects_tasks_list` takes `project_id` and optional `phase_id`. If you leave out the status when creating a task, the server picks the first open status for that phase (or the first status, if none are open).

### Read — 41 tools

| Tool                                      | Returns / key filters                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alga_assets_get`                         | Get one asset by ID. Use after a list or search to see full details.                                                                                                                                                                                                      |
| `alga_assets_list`                        | List assets, one page at a time. Use to browse or filter by client, type, status or location; use alga_assets_search to find assets by text.                                                                                                                              |
| `alga_assets_search`                      | Search assets by text and return matches. Use when you have words to find; narrow by client, type or status.                                                                                                                                                              |
| `alga_boards_list`                        | List ticket boards, optionally filtered by name search, one page at a time.                                                                                                                                                                                               |
| `alga_clients_contacts_list`              | List contacts belonging to one client, one page at a time. Use alga_contacts_list to browse across clients or alga_contacts_search to find a person by name or email.                                                                                                     |
| `alga_clients_get`                        | Get one client by ID. Use after a list or search to see full details.                                                                                                                                                                                                     |
| `alga_clients_list`                       | List clients, one page at a time. Use to browse or filter by name search, type or inactive state.                                                                                                                                                                         |
| `alga_clients_locations_list`             | List locations belonging to a client, one page at a time.                                                                                                                                                                                                                 |
| `alga_contacts_get`                       | Get one contact by ID. Use after a list or search to see full details.                                                                                                                                                                                                    |
| `alga_contacts_list`                      | List contacts, one page at a time. Use to browse or filter by client or inactive state; use alga_contacts_search to find a person by name or email.                                                                                                                       |
| `alga_contacts_search`                    | Search contacts by name or email and return matches. Optionally limit to one client or include inactive contacts.                                                                                                                                                         |
| `alga_contracts_list`                     | List contracts, one page at a time. Use to browse or filter by client, status or search.                                                                                                                                                                                  |
| `alga_invoices_get`                       | Get one invoice by ID. Use after a list or search to see full details.                                                                                                                                                                                                    |
| `alga_invoices_items_list`                | List line items on an invoice, one page at a time.                                                                                                                                                                                                                        |
| `alga_invoices_list`                      | List invoices, one page at a time. Use to browse or filter by client, status or date range.                                                                                                                                                                               |
| `alga_kb_articles_get`                    | Get one knowledge article by ID. Use after a list or search to see full details.                                                                                                                                                                                          |
| `alga_kb_articles_list`                   | List knowledge articles, one page at a time. Use to browse or filter by search, category, audience or status.                                                                                                                                                             |
| `alga_priorities_list`                    | List priorities, one page at a time. Use to browse or filter by priority name search.                                                                                                                                                                                     |
| `alga_projects_get`                       | Get one project by ID. Use after a list or search to see full details.                                                                                                                                                                                                    |
| `alga_projects_list`                      | List projects, one page at a time. Use to browse or filter by client, status or search.                                                                                                                                                                                   |
| `alga_projects_phases_list`               | List all phases in a project. This list is not paginated.                                                                                                                                                                                                                 |
| `alga_projects_tasks_get`                 | Get one project task by ID. Use after a list or search to see full details.                                                                                                                                                                                               |
| `alga_projects_task_status_mappings_list` | List the task statuses a project uses, in the order Alga shows them, with the ID to pass as project_status_mapping_id when you create or update a task. Pass phase_id to get the statuses for one phase; if that phase has no statuses of its own, you get the project's. |
| `alga_projects_tasks_list`                | List all tasks in a project. Pass phase_id to list only one phase; get phase IDs from alga_projects_phases_list. These lists are not paginated.                                                                                                                           |
| `alga_schedules_list`                     | List schedule entries, one page at a time. Use to browse or filter by user, work item or date range.                                                                                                                                                                      |
| `alga_search`                             | Search across record types at once. Use when you don't know the record type; pass the returned nextCursor as cursor to get more results.                                                                                                                                  |
| `alga_services_list`                      | List services, one page at a time. Use to browse or filter by name search or category.                                                                                                                                                                                    |
| `alga_statuses_list`                      | List statuses, one page at a time. Use to browse or filter by board or status type.                                                                                                                                                                                       |
| `alga_ticket_categories_list`             | List ticket categories, one page at a time. Use to browse or filter by board or parent category.                                                                                                                                                                          |
| `alga_tickets_assets_list`                | List assets linked to a ticket, one page at a time.                                                                                                                                                                                                                       |
| `alga_tickets_comments_list`              | List comments on a ticket, one page at a time. Set is_internal to true for internal notes only, or false for client-visible comments only.                                                                                                                                |
| `alga_tickets_get_by_external_link`       | Get the ticket linked to a record in another system, using that system's name and the record's ID there.                                                                                                                                                                  |
| `alga_tickets_get`                        | Get one ticket by ID. Use after a list or search to see full details.                                                                                                                                                                                                     |
| `alga_tickets_list`                       | List tickets, one page at a time. Use to browse or filter by client, board, status, priority, assignee, open or closed, dates or external link.                                                                                                                           |
| `alga_tickets_search`                     | Search tickets by text and return matches. Use when you have words from the title or description; add filters to narrow by client, board, status or assignee.                                                                                                             |
| `alga_tickets_time_entries_list`          | List time entries linked to a ticket, one page at a time.                                                                                                                                                                                                                 |
| `alga_time_entries_get`                   | Get one time entry by ID. Use after a list or search to see full details.                                                                                                                                                                                                 |
| `alga_time_entries_list`                  | List time entries, one page at a time. Use to browse or filter by user, work item, dates or billable state.                                                                                                                                                               |
| `alga_time_sheets_list`                   | List time sheets, one page at a time. Use to browse or filter by user, period or approval state.                                                                                                                                                                          |
| `alga_users_get`                          | Get one user profile by ID. Use after a list or search to see full details.                                                                                                                                                                                               |
| `alga_users_list`                         | List users, one page at a time. Use to browse or filter by search or inactive state.                                                                                                                                                                                      |

### Write — 18 tools

Writes (18, hidden unless `ALGA_ENABLE_WRITES=true`). The setting is container-wide: it turns writes on for every connection that container serves, not for one connection.

| Tool                             | Effect / returned result                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alga_assets_create`             | Create an asset and return it. Needs a client, type, asset tag, name and status.                                                                                                                                                                                        |
| `alga_assets_update`             | Update an asset and return it. Pass the asset ID and only the fields you want to change.                                                                                                                                                                                |
| `alga_clients_create`            | Create a client and return it. Needs a name and billing cycle.                                                                                                                                                                                                          |
| `alga_clients_update`            | Update a client and return it. Pass the client ID and only the fields you want to change.                                                                                                                                                                               |
| `alga_contacts_create`           | Create a contact and return it. Needs a full name and email.                                                                                                                                                                                                            |
| `alga_contacts_update`           | Update a contact and return it. Pass the contact ID and only the fields you want to change.                                                                                                                                                                             |
| `alga_kb_articles_create`        | Create a draft knowledge article and return it. This tool never publishes.                                                                                                                                                                                              |
| `alga_projects_tasks_create`     | Create a task in a project phase and return it. Needs the project ID, phase ID and a task name. To pick a status, pass project_status_mapping_id from alga_projects_task_status_mappings_list; if you leave it out, the task gets the first open status for that phase. |
| `alga_projects_tasks_update`     | Update a task and return it. Pass the task ID and only the fields you want to change.                                                                                                                                                                                   |
| `alga_schedules_create`          | Create a schedule entry and return it. Needs a title and start and end times; optionally assign users.                                                                                                                                                                  |
| `alga_tickets_checklist_create`  | Create a checklist item on a ticket and return it.                                                                                                                                                                                                                      |
| `alga_tickets_comments_create`   | Create a comment or internal note on a ticket and return it. Set is_internal to true to hide it from the client.                                                                                                                                                        |
| `alga_tickets_create`            | Create a ticket and return it. Needs a title plus client, board, status and priority IDs; get them from alga_clients_list, alga_boards_list, alga_statuses_list and alga_priorities_list.                                                                               |
| `alga_tickets_update`            | Update a ticket and return it. Pass the ticket ID and only the fields you want to change.                                                                                                                                                                               |
| `alga_tickets_update_assignment` | Update a ticket's primary assignee and return the ticket. Get user IDs from alga_users_list.                                                                                                                                                                            |
| `alga_tickets_update_status`     | Update a ticket's status and return the ticket. Get status IDs from alga_statuses_list.                                                                                                                                                                                 |
| `alga_time_entries_create`       | Create a time entry and return it. Needs a service ID, start and end times, and a work item type. If the work item type is ticket or project_task, also pass work_item_id for that ticket or task.                                                                      |
| `alga_time_entries_update`       | Update a time entry and return it. Pass the time entry ID and only the fields you want to change.                                                                                                                                                                       |

### Destructive — 12 tools (off by default; need `ALGA_ENABLE_WRITES=true` and `ALGA_ENABLE_DESTRUCTIVE=true`)

| Tool                         | Effect / returned result                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `alga_assets_delete`         | ⚠ DESTRUCTIVE: Delete an asset permanently.                                                                                                                                                                                                                                                                  |
| `alga_clients_delete`        | ⚠ DESTRUCTIVE: Delete a client permanently.                                                                                                                                                                                                                                                                  |
| `alga_clients_merge`         | ⚠ DESTRUCTIVE: Merge source_client_id into the client in id. Its contacts, tickets, billing and other records move over and it is marked as merged. This can't be undone. Leave pin_portal_grants on (the default) so portal users keep seeing only the billing they could see before.                       |
| `alga_contacts_delete`       | ⚠ DESTRUCTIVE: Delete a contact permanently.                                                                                                                                                                                                                                                                 |
| `alga_invoices_finalize`     | ⚠ DESTRUCTIVE: Finalize a draft invoice that has line items. This can charge the client via auto-pay. Marks it sent, locks items and payment method, may apply or issue client credit (deposit or prepayment) and may queue an accounting export. Emails no one. Can't be undone via these tools or the API. |
| `alga_invoices_send`         | ⚠ DESTRUCTIVE: Email an invoice to the addresses in email_addresses (at least one). This sends a real email and marks the invoice as sent.                                                                                                                                                                   |
| `alga_projects_delete`       | ⚠ DESTRUCTIVE: Delete a project permanently.                                                                                                                                                                                                                                                                 |
| `alga_projects_tasks_delete` | ⚠ DESTRUCTIVE: Delete a project task permanently.                                                                                                                                                                                                                                                            |
| `alga_schedules_delete`      | ⚠ DESTRUCTIVE: Delete a schedule entry permanently.                                                                                                                                                                                                                                                          |
| `alga_tickets_delete`        | ⚠ DESTRUCTIVE: Delete a ticket permanently.                                                                                                                                                                                                                                                                  |
| `alga_time_entries_delete`   | ⚠ DESTRUCTIVE: Delete a time entry permanently.                                                                                                                                                                                                                                                              |
| `alga_time_sheets_approve`   | ⚠ DESTRUCTIVE: Approve a time sheet for billing or payroll.                                                                                                                                                                                                                                                  |

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
release.

Apache-2.0; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
No Alga implementation code is included. Alga PSA is a trademark of Nine Minds.
This project is not affiliated with Nine Minds.

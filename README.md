<p align="center">
  <img src="assets/logo.svg" width="112" height="112" alt="Telegram Ads MCP logo">
</p>

<h1 align="center">Telegram Ads MCP</h1>

<p align="center">
  <a href="https://github.com/furkankoykiran/telegram-ads-mcp/actions/workflows/ci.yml"><img src="https://github.com/furkankoykiran/telegram-ads-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22.18-339933?logo=node.js&logoColor=white" alt="Node.js 22.18 or newer"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict"></a>
</p>

An open-source [Model Context Protocol](https://modelcontextprotocol.io) server for the **official
Telegram Ads API**. Manage accounts, advertisements, budgets, statistics, audiences, pixels and
targeting from Claude, Cursor, Codex, OpenCode or any MCP-compatible client.

- **Official API only.** No cookies, browser automation or private endpoints.
- **Local-first.** Runs over stdio on your machine. Your token never leaves it except to call
  `promoteapi.telegram.org`.
- **Safe by default.** Read-only mode, explicit write confirmation, budget caps, idempotency keys and
  an optional JSONL audit log.
- **Built for agents.** 24 focused tools, a searchable catalog of all 45 official methods, guided
  prompts, and an optional sandboxed Code Mode for multi-step work.

> This project is unofficial and is not affiliated with, endorsed by or sponsored by Telegram. The
> Telegram name and logo are trademarks of their respective owners.

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Safety model](#safety-model)
- [Tools](#tools)
- [Code Mode](#code-mode)
- [CLI](#cli)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [License](#license)

## Quick start

### Prerequisites

- Node.js **22.18 or newer** (24 LTS recommended)
- A Telegram Ads account with access to the API
- An API token from <https://ads.telegram.org/account/api>

### 1. Connect the server

The package name is `telegram-ads-mcp`. Until the first npm release is available, install straight
from GitHub; npm builds the package automatically:

```bash
npx -y github:furkankoykiran/telegram-ads-mcp doctor
```

After the npm release, the shorter form works too:

```bash
npx -y telegram-ads-mcp doctor
```

Or build a local checkout:

```bash
git clone https://github.com/furkankoykiran/telegram-ads-mcp.git
cd telegram-ads-mcp
npm install
node dist/cli.js doctor
```

`doctor` checks the token against the API and prints the account currency and budget. It is the
fastest way to confirm everything works.

### 2. Write your client configuration

`init` writes the correct file for each client and keeps a `.bak` copy of an existing config:

```bash
npx -y telegram-ads-mcp init --client claude-desktop --token <your-token>
npx -y telegram-ads-mcp init --client cursor --token <your-token>
npx -y telegram-ads-mcp init --client opencode --token <your-token>
npx -y telegram-ads-mcp init --client all --token <your-token>
```

Before the npm release, add `--github` so the generated config launches the GitHub package instead:

```bash
npx -y github:furkankoykiran/telegram-ads-mcp init --client all --github --token <your-token>
```

For a local checkout, add `--local .` so the generated config launches `node dist/cli.js` instead of
`npx`:

```bash
node dist/cli.js init --client claude-desktop --local . --token <your-token>
```

Prefer to edit files by hand? `--print` prints the merged configuration without writing anything.
Claude Code and Codex are CLI-based; `init` prints the exact `claude mcp add` / `codex mcp add`
command instead of editing their config.

<details>
<summary>Claude Desktop / Cursor JSON</summary>

```json
{
  "mcpServers": {
    "telegram-ads": {
      "command": "npx",
      "args": ["-y", "telegram-ads-mcp"],
      "env": {
        "TELEGRAM_ADS_TOKEN": "your-token",
        "TG_ADS_MODE": "read-only",
        "TG_ADS_CODE_MODE": "read-only"
      }
    }
  }
}
```

</details>

<details>
<summary>OpenCode JSON</summary>

```json
{
  "mcp": {
    "telegram-ads": {
      "type": "local",
      "command": ["npx", "-y", "telegram-ads-mcp"],
      "environment": {
        "TELEGRAM_ADS_TOKEN": "your-token",
        "TG_ADS_MODE": "read-only",
        "TG_ADS_CODE_MODE": "read-only"
      },
      "enabled": true
    }
  }
}
```

</details>

<details>
<summary>Claude Code and Codex</summary>

```bash
claude mcp add telegram-ads --scope user \
  --env TELEGRAM_ADS_TOKEN=<your-token> \
  --env TG_ADS_MODE=read-only \
  -- npx -y telegram-ads-mcp

codex mcp add telegram-ads \
  --env TELEGRAM_ADS_TOKEN=<your-token> \
  --env TG_ADS_MODE=read-only \
  -- npx -y telegram-ads-mcp
```

</details>

### 3. Ask your agent to start

Restart the client and ask:

> Use `tg_get_account` to show my Telegram Ads account and currency.

Then try a read-only report:

> Use `tg_get_stats` for the last 30 days, daily interval, and summarize spend, views, CTR and CPM.

## Configuration

All configuration is environment-based. The server never reads `.env` files implicitly; load them
explicitly with `node --env-file=.env` if you prefer a file.

| Variable                  | Default      | Description                                                             |
| ------------------------- | ------------ | ----------------------------------------------------------------------- |
| `TELEGRAM_ADS_TOKEN`      | required     | API token from <https://ads.telegram.org/account/api>.                  |
| `TG_ADS_TOKEN`            | —            | Alias for `TELEGRAM_ADS_TOKEN`.                                         |
| `TG_ADS_MODE`             | `read-only`  | `read-only` or `write`. Write tools are blocked unless this is `write`. |
| `TG_ADS_CODE_MODE`        | `read-only`  | `off`, `read-only` or `write`. Controls `tg_execute`.                   |
| `TG_ADS_ALLOWED_ACCOUNTS` | all          | Comma-separated allowlist for explicit `account_id` values.             |
| `TG_ADS_MAX_CPM`          | no cap       | Maximum CPM accepted by the server, in account currency.                |
| `TG_ADS_MAX_AD_BUDGET`    | no cap       | Maximum ad budget or budget transfer per call.                          |
| `TG_ADS_MAX_DAILY_BUDGET` | no cap       | Maximum daily budget limit per call.                                    |
| `TG_ADS_AUDIT_LOG`        | disabled     | Path to a JSONL audit log. Parent directories are created.              |
| `TG_ADS_TIMEOUT_MS`       | `30000`      | Per-request timeout in milliseconds.                                    |
| `TG_ADS_BASE_URL`         | official API | Override only for testing. The token is sent to this URL.               |

Caps apply **per call**. They are a guardrail, not a full budgeting system: a loop of approved
calls can still spend more than a single cap. Use `TG_ADS_ALLOWED_ACCOUNTS` and the read-only
default when you want hard limits on what an agent can touch.

### Currency precision

Telegram rejects values with too many decimals. The server validates them before sending:

| Currency | CPM and budgets | Amounts (transfers, account budget) |
| -------- | --------------- | ----------------------------------- |
| EUR      | 2 decimals      | 5 decimals                          |
| TON      | 2 decimals      | 5 decimals                          |
| XTR      | 0 decimals      | 3 decimals                          |

`tg_get_account` returns the account currency. `tg_create_ad` and `tg_ad_budget` refuse mismatched
precision with a clear error.

## Safety model

The server is designed to be useful to an agent without giving it uncontrolled access to money.

1. **Read-only by default.** `TG_ADS_MODE` defaults to `read-only`. Every write tool fails before it
   reaches the API.
2. **Per-call confirmation.** In write mode, every write also requires `confirm: true`. The model
   must decide to pass it, and the call is visible in the transcript.
3. **New ads start paused with zero budget.** `tg_create_ad` defaults `is_paused` to `true` and
   `initial_budget` to `0`. Funding is a separate, explicit step.
4. **Dry runs.** `tg_create_ad` and `tg_update_ad` accept `dry_run: true` to show the exact payload
   and currency without calling the API.
5. **Account allowlist.** `TG_ADS_ALLOWED_ACCOUNTS` rejects explicit `account_id` values outside the
   list.
6. **Budget caps.** `TG_ADS_MAX_CPM`, `TG_ADS_MAX_AD_BUDGET` and `TG_ADS_MAX_DAILY_BUDGET` reject
   oversized values before the request is sent.
7. **Idempotency.** Every write carries an `Idempotency-Key`; retries reuse the same key. Tools
   accept an explicit key when the caller needs to retry safely.
8. **Audit log.** Set `TG_ADS_AUDIT_LOG` to keep a JSONL record of tool calls. Phone numbers, emails
   and legal names are summarized, and ad text/code is reduced to its length.
9. **No token in logs.** The token is never included in tool output, errors or the audit log.

Code Mode adds a second gate: writes inside `tg_execute` require `TG_ADS_MODE=write`,
`TG_ADS_CODE_MODE=write` **and** `confirm: true` on the `tg_execute` call.

## Tools

Every tool returns JSON text. Errors are returned with `isError: true` and a stable code such as
`WRITE_DISABLED`, `CONFIRMATION_REQUIRED`, `UNAUTHORIZED` or `CHANNEL_ID_UNKNOWN`.

### Account

| Tool                  | Access | Purpose                                                               |
| --------------------- | ------ | --------------------------------------------------------------------- |
| `tg_get_account`      | read   | Current account, currency, budgets. Optionally list related accounts. |
| `tg_get_account_info` | read   | Billing/profile details (company, email, phone, country, city).       |
| `tg_account_budget`   | write  | Increase or decrease a related account's budget.                      |

### Advertisements

| Tool              | Access | Purpose                                                              |
| ----------------- | ------ | -------------------------------------------------------------------- |
| `tg_list_ads`     | read   | Paged ad list with status, budgets and lifetime metrics.             |
| `tg_get_ads`      | read   | Up to 100 ads by ID, including decline reasons.                      |
| `tg_create_ad`    | write  | Create a paused, zero-budget ad. Supports `dry_run`.                 |
| `tg_update_ad`    | write  | Edit fields, pause/resume, or submit for review. Supports `dry_run`. |
| `tg_ad_budget`    | write  | Move funds into or out of an ad.                                     |
| `tg_delete_ad`    | write  | Delete an inactive ad with no remaining budget.                      |
| `tg_upload_media` | write  | Upload ad photos, videos or website photos from a local path.        |

### Statistics

| Tool            | Access | Purpose                                               |
| --------------- | ------ | ----------------------------------------------------- |
| `tg_get_stats`  | read   | Account or per-ad stats, with totals and CTR/CPM/CPC. |
| `tg_get_report` | read   | Telegram's monthly account report.                    |

### Targeting

| Tool                | Access | Purpose                                                     |
| ------------------- | ------ | ----------------------------------------------------------- |
| `tg_list_targeting` | read   | Languages, topics, countries, locations, channels and bots. |

### Audiences and pixels

| Tool                   | Access | Purpose                                         |
| ---------------------- | ------ | ----------------------------------------------- |
| `tg_list_audiences`    | read   | List or fetch retargeting audiences.            |
| `tg_manage_audience`   | write  | Create, edit or delete a phone-number audience. |
| `tg_get_pixel`         | read   | Pixel ID and installation snippet.              |
| `tg_list_pixel_events` | read   | List or fetch conversion events.                |
| `tg_manage_pixel`      | write  | Create the pixel, create/rename/delete events.  |

### Transactions

| Tool                   | Access | Purpose                                        |
| ---------------------- | ------ | ---------------------------------------------- |
| `tg_list_transactions` | read   | Account-level or ad-level transaction history. |
| `tg_get_transaction`   | read   | Status of a budget transaction.                |

### Advanced

| Tool          | Access     | Purpose                                                        |
| ------------- | ---------- | -------------------------------------------------------------- |
| `tg_search`   | read       | Search all official methods by name, description or parameter. |
| `tg_get_sdk`  | read       | TypeScript declarations for the Code Mode `tg` namespace.      |
| `tg_execute`  | sandboxed  | Run JavaScript with sequential API calls in QuickJS.           |
| `tg_api_call` | read/write | Escape hatch for any method without a dedicated tool.          |

The server also exposes:

- **Resources:** `telegram-ads://guide`, `telegram-ads://method-catalog`, `telegram-ads://sdk.d.ts`
- **Prompts:** `launch-ad`, `audit-account`, `weekly-report`

## Code Mode

Code Mode lets an agent run one short JavaScript program instead of dozens of tool calls: bulk
edits, pagination, joins, cross-ad analysis and compact reports.

```js
const ads = await tg.getAdsList({ limit: 100 });
const active = ads.ads.filter((ad) => ad.status === "active");
return active
  .sort((a, b) => (b.spent_budget ?? 0) - (a.spent_budget ?? 0))
  .map((ad) => ({
    id: ad.ad_id,
    title: ad.title,
    spent: ad.spent_budget,
    cpm: ad.cpm,
  }));
```

Limits and guarantees:

- QuickJS (WebAssembly) sandbox with **no network, filesystem, process or environment access**.
- Only the `tg` object and `console` are exposed.
- Calls run **sequentially**, so scripts are deterministic and cannot burst the API.
- At most **25 API calls**, **15 seconds**, **64 MB** of memory and **64 KB** of output per run.
- Read-only unless `TG_ADS_MODE=write` **and** `TG_ADS_CODE_MODE=write`, and `tg_execute` is called
  with `confirm: true`.

See [docs/code-mode.md](docs/code-mode.md) for examples and the full security model.

## CLI

```text
telegram-ads-mcp serve              Start the MCP server over stdio (default)
telegram-ads-mcp doctor             Check configuration and verify the token
telegram-ads-mcp init               Write MCP client configuration
telegram-ads-mcp --version          Print the version
```

`init` options:

```text
--client <name...>   claude-desktop, cursor, opencode, claude-code, codex, or all
--token <token>      Defaults to TELEGRAM_ADS_TOKEN
--mode <mode>        read-only or write (default: read-only)
--code-mode <mode>   off, read-only or write (default: read-only)
--local <path>       Launch a built local checkout instead of npx
--github             Launch github:furkankoykiran/telegram-ads-mcp instead of the npm package
--print              Print the configuration without writing files
```

The token is stored in plain text in the generated client config. Keep that file private and revoke
the token at <https://ads.telegram.org/account/api> if it is exposed.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

| Script                 | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | Run the CLI from source with `tsx`.                             |
| `npm run check`        | Typecheck, lint and test in one pass.                           |
| `npm run sync-catalog` | Re-parse the official docs and regenerate `src/api/catalog.ts`. |
| `npm run format`       | Format the repository with Prettier.                            |

Project layout:

```text
src/
  api/          Catalog, shared types and the HTTP client
  code-mode/    QuickJS sandbox and generated SDK declarations
  tools/        MCP tool registrations
  cli.ts        serve / doctor / init
  server.ts     McpServer assembly
  policy.ts     Write gates, account allowlist and budget caps
  audit.ts      Optional JSONL audit log
tests/
  unit/         Money, client, policy, sandbox, catalog, schemas
  contract/     End-to-end MCP client/server contract tests
```

The method catalog is generated from <https://ads.telegram.org/docs/api>. If Telegram ships a new
API revision, run `npm run sync-catalog`, review the diff and update the tools that need new fields.
Do not edit `src/api/catalog.ts` by hand.

## Troubleshooting

| Symptom                                 | Fix                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `UNAUTHORIZED` / HTTP 401               | The token is invalid or revoked. Create a new one at <https://ads.telegram.org/account/api>.         |
| `WRITE_DISABLED`                        | Set `TG_ADS_MODE=write` in the server environment and restart the client.                            |
| `CONFIRMATION_REQUIRED`                 | Re-run the write with `confirm: true` after checking the parameters.                                 |
| `CHANNEL_ID_UNKNOWN` / `BOT_ID_UNKNOWN` | Use `@username` first so the account resolves it, then numeric IDs will work.                        |
| `IDEMPOTENT_PARAM_MISMATCH`             | The key was already used with different parameters. Retry with a new key.                            |
| `IDEMPOTENT_REQUEST_IN_PROGRESS`        | An identical request is still running. Wait and retry with the same key.                             |
| Precision errors                        | Check the account currency with `tg_get_account`; EUR/TON use 2 decimals for CPM, XTR uses 0.        |
| Stats range error                       | Use an interval of 300 or 86400 seconds and at most 1000 intervals; the server splits larger ranges. |
| Client does not see the server          | Restart the client after editing its config, and check that `node --version` is 22.18 or newer.      |

## Security

Please read [SECURITY.md](SECURITY.md) before using write mode in production. Report vulnerabilities
through GitHub's private vulnerability reporting, not in a public issue.

## License

MIT © Furkan Koykiran. See [LICENSE](LICENSE).

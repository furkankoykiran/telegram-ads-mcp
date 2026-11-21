# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| Older   | No        |

The project is pre-1.0. Security fixes land on `main` and in the latest release.

## Reporting a vulnerability

Do **not** open a public issue for a vulnerability. Use GitHub's private
vulnerability reporting:

<https://github.com/furkankoykiran/telegram-ads-mcp/security/advisories/new>

Include:

- a description of the issue and its impact,
- the affected version or commit,
- reproduction steps or a proof of concept,
- any suggested fix.

You can expect an initial response within a few days. Please give the maintainer a reasonable window
to ship a fix before publishing details.

## Threat model

This server is a local stdio process that holds a Telegram Ads API token and can move advertising
budgets. The main risks are:

1. **Unauthorized writes.** An agent or prompt injection could try to create ads, change budgets or
   delete data. Mitigations: read-only default, per-call `confirm: true`, account allowlist, budget
   caps and a separate Code Mode write gate.
2. **Token disclosure.** The token is read from the environment and sent only to the configured API
   base URL. It is never written to tool output, errors or the audit log. Client configuration files
   created by `init` contain the token in plain text, so protect those files and revoke the token at
   <https://ads.telegram.org/account/api> if it leaks.
3. **Malicious tool input.** Paths passed to `tg_upload_media` are read from the local filesystem.
   Run the server under an account that can only read the media you intend to upload.
4. **Code Mode escape.** `tg_execute` runs model-written JavaScript in QuickJS with no network,
   filesystem, process or environment access. It exposes only `tg` and `console`, limits calls,
   time, memory and output, and gates writes separately. Treat it as defense in depth, not as a
   substitute for the write policy.
5. **Supply chain.** Dependencies are pinned by `package-lock.json`. Review lockfile changes and
   install with `npm ci` in automation.

## Hardening checklist

- Keep `TG_ADS_MODE=read-only` unless writes are actively needed.
- Set `TG_ADS_ALLOWED_ACCOUNTS` when you manage more than one account.
- Set `TG_ADS_MAX_CPM`, `TG_ADS_MAX_AD_BUDGET` and `TG_ADS_MAX_DAILY_BUDGET` to values you are
  willing to lose to a mistaken call.
- Enable `TG_ADS_AUDIT_LOG` and ship the file to append-only storage.
- Leave `TG_ADS_CODE_MODE=off` or `read-only` for unattended agents.
- Do not set `TG_ADS_BASE_URL` outside of tests. The token is sent to whatever URL is configured.
- Rotate the token if a client config, terminal history or log is exposed.

## Scope

The following are out of scope:

- vulnerabilities in Telegram's API or infrastructure,
- issues that require an already-compromised machine or token,
- social engineering,
- denial of service against your own local process.

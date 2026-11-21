# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-11-21

### Fixed

- The CLI and MCP server now report the version from `package.json` instead of a hardcoded
  `0.1.0` value.

## [0.1.2] - 2026-11-21

### Changed

- npm releases now use trusted publishing over GitHub OIDC; the `NPM_TOKEN` secret and
  `NODE_AUTH_TOKEN` environment variable are no longer used.
- The release workflow now waits up to six minutes for a new npm version to propagate before
  publishing to the MCP Registry.
- Release and contribution docs describe the OIDC setup and keep the version in `package-lock.json`
  and `server.json` in sync.

### Fixed

- Normalized the `bin` paths in `package.json` so npm reports the CLI entries without a leading
  `./`.

## [0.1.1] - 2026-11-21

### Added

- `mcpName` ownership marker so the npm package can be verified by the official MCP Registry.
- Release workflow now publishes `server.json` to the MCP Registry with OIDC after npm.
- Version check that keeps `server.json` and `package.json` in sync during releases.

### Changed

- README now documents npm as the primary install path and links the MCP Registry listing.

## [0.1.0] - 2026-11-21

### Added

- MCP server for the official Telegram Ads API, running locally over stdio.
- 24 tools covering accounts, advertisements, budgets, media uploads, statistics, reports,
  targeting, audiences, pixels and transactions.
- Generated catalog of all 45 official methods, with `tg_search` and a typed `tg_get_sdk` resource.
- Sandboxed Code Mode (`tg_execute`) with QuickJS, sequential API calls and a separate write gate.
- Read-only default, per-call confirmation, account allowlist, budget caps, idempotency keys and an
  optional JSONL audit log.
- CLI with `serve`, `doctor` and `init` for Claude Desktop, Claude Code, Cursor, Codex and OpenCode.
- Resources (`guide`, `method-catalog`, `sdk.d.ts`) and prompts (`launch-ad`, `audit-account`,
  `weekly-report`).
- Original SVG logo, MCP registry metadata and npm package assets.
- Unit and contract tests, strict TypeScript, ESLint, Prettier and GitHub Actions CI on Node 22 and 24. Requires Node.js 22.18 or newer.

[Unreleased]: https://github.com/furkankoykiran/telegram-ads-mcp/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/furkankoykiran/telegram-ads-mcp/releases/tag/v0.1.3
[0.1.2]: https://github.com/furkankoykiran/telegram-ads-mcp/releases/tag/v0.1.2
[0.1.1]: https://github.com/furkankoykiran/telegram-ads-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/furkankoykiran/telegram-ads-mcp/releases/tag/v0.1.0

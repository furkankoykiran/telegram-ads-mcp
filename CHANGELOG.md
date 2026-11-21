# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/furkankoykiran/telegram-ads-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/furkankoykiran/telegram-ads-mcp/releases/tag/v0.1.0

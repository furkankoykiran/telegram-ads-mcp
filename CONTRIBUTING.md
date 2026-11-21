# Contributing

Thanks for helping improve Telegram Ads MCP. This project is intentionally small: a focused API
client, a thin tool layer, a sandboxed Code Mode and a CLI. Please keep changes in that spirit.

## Development setup

Requirements:

- Node.js 22.18 or newer (24 LTS recommended)
- npm 10 or newer
- A Telegram Ads API token only if you want to run live checks. Unit and contract tests use a fake
  client and do not need a token.

```bash
git clone https://github.com/furkankoykiran/telegram-ads-mcp.git
cd telegram-ads-mcp
npm install
npm run check
```

`npm install` runs the build through the `prepare` script.

## Before opening a pull request

Run the full check locally:

```bash
npm run format
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same commands on Node 22 and 24.

## Guidelines

- **English only.** Code, comments, documentation, commit messages and issues must be in English.
- **Keep it minimal.** Prefer a small change that solves the problem over a new abstraction. No
  dependency is added without a clear reason.
- **Safety first.** Any new write path must respect `TG_ADS_MODE`, `confirm: true`, the account
  allowlist and the budget caps. Add tests for the blocked path as well as the allowed path.
- **Types over casts.** The API surface is typed in `src/api/types.ts`. Extend it instead of using
  `any`.
- **No secrets.** Never commit tokens, account IDs, phone numbers, customer data or real audit logs.
- **Tests.** Bug fixes need a regression test. New tools need a contract test in
  `tests/contract/server.test.ts`.
- **Docs.** Update `README.md`, `docs/code-mode.md` and `CHANGELOG.md` when behavior changes.

## Commit messages

Use short, imperative, conventional-style subjects:

```text
feat(tools): add tg_account_budget
fix(client): cancel retry response bodies
docs: document the write gate
test(code-mode): cover sequential calls
```

Keep each commit focused. Separate refactors from behavior changes.

## API catalog

`src/api/catalog.ts` is generated from <https://ads.telegram.org/docs/api>:

```bash
npm run sync-catalog
```

Do not edit the generated file by hand. Review the diff after regenerating and update any tool
schemas that depend on changed parameters.

## Adding a tool

1. Add the registration in the relevant `src/tools/*.ts` file.
2. Use `toolHandler` so policy checks, audit logging and error mapping stay consistent.
3. Mark reads with `readOnlyHint: true`. Writes must call the policy gate before the client.
4. Add the tool to the README table and a contract test that lists it.
5. If the tool changes state, add an audit test and a blocked-mode test.

## Releases

1. Update `CHANGELOG.md` and bump the version in `package.json`, `package-lock.json` and both places
   in `server.json`.
2. Run `npm run check && npm run build`.
3. Open a pull request, merge it, and wait for CI on `main`.
4. Create and push a tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. The `Release` workflow publishes to npm with provenance, updates the MCP Registry and creates a
   GitHub release.

Publishing uses npm trusted publishing over GitHub OIDC, so no `NPM_TOKEN` secret is required. The
workflow can also be started manually with `workflow_dispatch` and `publish: true`.

## Reporting bugs

Use the issue templates. For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a
public issue.

## License

By contributing, you agree that your contributions are licensed under the MIT License.

# Releasing

Releases are tag-driven. The workflow in `.github/workflows/release.yml` publishes the npm
package, waits for registry propagation, publishes `server.json` to the official MCP Registry with
OIDC, and creates the GitHub release.

## Checklist

1. Update the version in `package.json` and in both places in `server.json`. The release workflow
   fails if they drift.
2. Add the release notes to `CHANGELOG.md` and update the comparison links.
3. Run `npm run check`, `npm run format:check` and `npm run build`.
4. Open a pull request, wait for CI and squash-merge it.
5. Tag the merge commit and push the tag:

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

6. Watch the Release workflow and confirm the npm version, MCP Registry entry and GitHub release.

## Trusted publishing

The first publish used the `NPM_TOKEN` repository secret. To remove that long-lived token and
publish with OIDC:

1. Open the package settings on npmjs.com and choose **Trusted publishing**.
2. Add a GitHub Actions publisher with repository `furkankoykiran/telegram-ads-mcp` and workflow
   `release.yml`. Leave the environment empty.
3. Delete the `NPM_TOKEN` secret from the GitHub repository.
4. Push the next `v*` tag. The workflow already requests `id-token: write` and publishes with
   `--provenance`, so npm authenticates through OIDC.

The npm CLI cannot create this relationship with a granular access token that bypasses 2FA. An
account owner must complete the one-time setup in the npm web UI.

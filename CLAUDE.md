# CLAUDE.md

A public npm package that syncs a business's Trustindex reviews into an Astro site. Its README ships to npm as
the package's documentation, including the Trustindex widget requirements and the setup each site needs.

## Hard rules

- **Tests never reach Trustindex.** They stub `fetch` and run against `tests/fixtures/widget.html`.
- **Fixtures and examples are invented.** Never capture a real widget, review or reviewer name into the
  repository: the package is public, and the sites using it belong to clients.
- **Review text never reaches Markdown or `set:html`.** Members of the public wrote it; it is stored and served
  as a plain string.
- **`reviews.json` belongs to the sync and `featured.json` to people.** The sync rewrites its file whole and
  never writes the other; nothing hand-edited may move into `reviews.json`.

## Releasing

- **The owner cuts releases.** Don't tag or publish unless asked.
- **Releases publish from CI, never from a workstation.** Bump `version` in `package.json`, commit it as
  `Release <version>`, tag that commit `v<version>` and push the tag. The `publish` job in `.github/workflows/ci.yml`
  stages it on npm once `verify` passes, and it is installable only after the owner approves it.

## Verify before finishing

```bash
pnpm format:check
pnpm test
```

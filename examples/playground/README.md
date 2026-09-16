# Schema Canvas playground

This is a static, browser-only example of the package. It uses an intentionally
fictional airship database. Layout and annotation edits are stored in the
browser's local storage; there is no backend and no consumer data.

From the repository root:

```sh
pnpm example:dev
```

The production bundle is generated with `pnpm example:build`. The output goes
to `example-dist/`, which can later be deployed to GitHub Pages or another
static host.

# Release safety

## Publication policy

The release decisions are:

- npm package: `schema-canvas`, unscoped and public;
- source repository: `valentindoering/schema-canvas`, public;
- license: MIT, copyright Valentin Döring;
- initial maintainer: `valentindoering`;
- a push to `main` that changes `package.json` starts the release workflow;
  the version must be advanced before that push.

`@valentindoering/schema-canvas@0.1.1` is the legacy published package. Do not
unpublish it. Deprecating the scoped package with a migration message is a
separate release action that requires explicit approval.

Do not infer an open-source license from public npm visibility. Do not publish
code derived from private consumers until ownership and licensing are clear.

## Release path

For current releases, bump the package version and update this changelog in the
same change as the source. Merge to `main` after the full quality gate passes.
The release workflow runs on that push and publishes with npm trusted publishing
and provenance. Keep the `npm-release` environment limited to `main`, and remove
its required reviewer only when automatic publication is intended. A manual
workflow dispatch remains available for recovery, but cannot republish an
existing version.

The release workflow should use a current Node version, npm trusted publishing
with OIDC, `id-token: write`, a clean install, the full quality gate, and a
packed-package smoke test. Do not store a long-lived npm write token when OIDC
is available.

## Versioning and consumers

Keep consumers on exact versions while the package is `0.x`. Use an automated
dependency updater to open reviewable version-bump pull requests. A lockfile
means a semver range alone does not make already installed applications receive
an update.

Each release must include a concise changelog and explicitly call out stored
layout or annotation migrations. Breaking stored-data changes require a major
version after `1.0.0` and an executable migration path.

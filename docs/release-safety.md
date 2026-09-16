# Release safety

## Before enabling publication

The initial release decisions are:

- npm package: `@valentindoering/schema-canvas`, public;
- source repository: `valentindoering/schema-canvas`, public;
- license: MIT, copyright Valentin Döring;
- initial maintainer: `valentindoering`;
- releases require explicit approval through the `npm-release` GitHub
  environment.

Do not infer an open-source license from public npm visibility. Do not publish
code derived from private consumers until ownership and licensing are clear.

## Recommended release path

1. Keep `private: true` through extraction and consumer integration.
2. Build and test a local tarball with `npm pack --dry-run` and `npm pack`.
3. Install that tarball in consumer worktrees and complete compatibility tests.
4. Create the public source repository.
5. Make the first package record through the approved npm account flow.
6. Configure npm trusted publishing for a GitHub-hosted release workflow.
7. Use a protected GitHub environment for release approval.
8. Remove `private: true`, publish `0.1.0`, and inspect the
   registry tarball.

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

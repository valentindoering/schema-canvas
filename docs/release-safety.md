# Release safety

## Before enabling publication

The release decisions are:

- npm package: `schema-canvas`, unscoped and public;
- source repository: `valentindoering/schema-canvas`, public;
- license: MIT, copyright Valentin Döring;
- initial maintainer: `valentindoering`;
- releases require explicit approval through the `npm-release` GitHub
  environment.

`@valentindoering/schema-canvas@0.1.1` is the legacy published package. Do not
unpublish it. The repository now targets the unscoped `schema-canvas` package
and kept `private: true` through local integration testing. After the unscoped package is
verified, deprecating the scoped package with a migration message is a separate
release action that requires explicit approval.

The approved first unscoped release is `0.2.0`. The package name, public
visibility, MIT license, and removal of the publication guard are approved.

Do not infer an open-source license from public npm visibility. Do not publish
code derived from private consumers until ownership and licensing are clear.

## Recommended release path

1. Keep `private: true` through extraction and consumer integration.
2. Build and test a local tarball with `npm pack --dry-run` and `npm pack`.
3. Install that tarball in consumer worktrees and complete compatibility tests.
4. Create the public source repository.
5. Remove `private: true` only in the approved release change. Publish the first
   version through the maintainer's authenticated npm account with browser 2FA.
   If bootstrapping from a local checkout, disable provenance for that one
   publish: local publication cannot produce GitHub OIDC attestations.
6. Inspect the registry tarball against the reviewed local candidate.
7. Configure npm trusted publishing for the new package identity and the
   GitHub-hosted release workflow. Use the protected `npm-release` environment
   for release approval.
8. Publish subsequent versions through that workflow, with provenance enabled.

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

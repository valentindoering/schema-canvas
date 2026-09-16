# Schema Canvas agent notes

## Purpose

Build a reusable schema-diagram package without importing the identity, data,
or architecture of any private consumer.

## Privacy boundary

- Never commit consumer repository names, organization names, local paths,
  remote URLs, commit hashes, screenshots, schemas, table names, layouts,
  annotations, business vocabulary, or migration notes.
- Do not copy private fixtures into this repository, even if they look generic.
- Use fictional tables and relationships in examples and tests.
- Keep consumer audits, migration plans, and integration prompts outside this
  repository.
- Inspect `git diff --cached` and `npm pack --dry-run` before every commit that
  may be published.

## Product rules

- Keep routes, authentication, authorization, and environment policy in the
  host application.
- Keep browser exports free of Node.js modules.
- Put source parsers and filesystem persistence behind explicit `server/*`
  subpath exports.
- Fail loudly on malformed source declarations, invalid persisted state, and
  revision conflicts. Do not silently hide missing schema data.
- Preserve checked-in layout and annotation data through upgrades. Add explicit
  migrations for any stored-format change.
- Prefer controlled callbacks over importing a router, query library,
  translation library, or application UI kit.
- Ship plain CSS with documented CSS variables. Do not require consumers to
  scan package source with a utility-CSS compiler.
- Disable implicit keyboard deletion. Destructive annotation actions must be
  explicit.
- Keep the first release one package with subpath exports. Split packages only
  when an independently versioned boundary is proven.

## Quality gate

Before a release candidate:

1. Run formatting, lint, typecheck, unit tests, component tests, and build.
2. Test the packed tarball, not only workspace source imports.
3. Verify every public subpath from both TypeScript and Node ESM fixtures.
4. Run browser tests for read-only and writable modes.
5. Verify revision conflict, failed save, and malformed-source behavior.
6. Review the package tarball for private or unnecessary files.

Publishing remains blocked while `package.json` contains `"private": true`.
Removing that guard requires an explicit visibility and license decision.

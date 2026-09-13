# Kukla2D custom RepoAtlas rules

This directory is owned by Kukla2D. It contains the repository policy that
must stay with this repository and must not be published as part of the
portable `repoatlas` package. The package provides the neutral
configuration, ESLint plugin instances, check runner, registry API, and the
extension contract; this directory supplies Kukla2D's policy through that
contract.

## Entry point

`index.js` exports a RepoAtlas extension created with `defineRepoExtension`.
`repoatlas lint` injects the package-owned flat config directly into ESLint and
discovers this directory automatically, so Kukla2D does not need a root
`eslint.config.js`. If the config API is used directly, pass the loaded
extension as `createConfig({ config, extension })`.

The extension's `extendConfig({ config, context, registry })` function mutates
the portable flat-config structures supplied by RepoAtlas. It does not import
ESLint implementations or plugin dependencies. The external package remains
portable and can be installed through `npm link` in any repository.

## Ownership and file-per-rule layout

Kukla2D-specific rules, exceptions, and repository checks belong here. Keep one
rule or check implementation per file under `rules/` or `checks/`, with tests
and fixtures under `tests/` and `fixtures/` respectively. Neutral rules belong
in `repoatlas`; do not copy them into this directory.

`registry/index.js` is the local message registry. Each ARCH-RS policy has a
dedicated registry file, a stable code, rationale, fix guidance, and executor
metadata. The current repository-specific codes are ARCH-RS-1 through
ARCH-RS-7. Add new repository diagnostics to the registry before wiring them
into `rules/index.js`.

`rules/` uses file-per-rule composition:

- `arch-rs-1` through `arch-rs-5` contain the existing boundary/config rules;
- `arch-rs-6` owns the Canvas `max-lines` block;
- `arch-rs-7` owns the production `id-denylist` block;
- the remaining files contain domain dependency policies, workspace elements,
  import ordering, exceptions, prop-types, and Live2D ignores.

`extension.js` is intentionally only the adapter to `rules/index.js`. Keep
policies and rule-specific configuration out of that adapter.

`config.yaml` is also repository-owned. Paths, TypeScript manifests, ignores,
and type-locality exceptions are relative to the Kukla2D root. It intentionally
has no portable/repository preset selector: loading this extension is the
explicit opt-in for Kukla2D policy.

Every registered rule is enabled by default. Disable one rule globally or
allow it only for an exceptional path in `config.yaml`:

```yaml
rules:
  ARCH-RS-1:
    enabled: true
    exceptions:
      - src/legacy-browser-bridge/**
  ARCH-RS-7: false
```

Exception globs are relative to the repository root and affect only their own
rule. Neutral identifiers such as `ARCH-007` and direct ESLint names such as
`import-x/no-unresolved` use the same syntax.

## Connecting the package

For active local development:

```bash
cd /absolute/path/to/repoatlas
npm link
cd /absolute/path/to/Kukla2D
npm link repoatlas --no-save
```

Running RepoAtlas discovers this directory's entry point automatically and
creates the `.repoatlas` scaffold in a new repository when it is missing;
existing files are preserved. Knip configuration also lives here in
`knip.json`; Kukla2D does not own a second root-level tooling config.

Use `repoatlas check` for all enabled layers, or select `repoatlas lint`,
`repoatlas repo`, `repoatlas typecheck`, and `repoatlas dead-code` individually.

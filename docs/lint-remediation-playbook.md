# Lint remediation playbook

## Objective and baseline

Reduce the repository lint baseline to zero without weakening `lint-registry.js`
or `eslint.config.js`, changing runtime behaviour, or discarding the existing
type-locality migration.

Baseline captured on 2026-09-07:

- 1,000 total errors: 648 ESLint and 352 type-locality.
- `local/no-internal-reexports`: 610 (`ARCH-019`).
- `TYPE-004`: 307.
- `TYPE-003`: 45.
- Remaining architecture errors: `ARCH-004` 19, `ARCH-008` 6,
  `ARCH-014` 6, `ARCH-017` 2, `ARCH-006` 2, `ARCH-005` 2, and
  `ARCH-018` 1.
- `npm run typecheck` passes.

Treat this baseline as informational. Recalculate it before and after every
batch because all agents share the same worktree.

## Mandatory order

1. Eliminate `TYPE-004`.
2. Eliminate `TYPE-003` without introducing `TYPE-001`.
3. Eliminate `ARCH-019` after type ownership is stable.
4. Eliminate `ARCH-014`, `ARCH-017`, and `ARCH-018`.
5. Resolve `ARCH-004`, `ARCH-005`, `ARCH-006`, and `ARCH-008` in
   coordinator-approved clusters.

Never suppress, downgrade, disable, or broaden an exception to a lint rule.
Do not edit `eslint-rules/lint-registry.js` or `eslint.config.js` as part of
remediation.

## Batch contract

- Work only in the paths named in the assignment and the direct import
  consumers that must change with them.
- A type-locality batch contains one cohesive subsystem and no more than 15
  diagnostics. Do not split declarations from the same type file across
  batches.
- An `ARCH-019` batch contains no more than five forwarding files or 30
  diagnostics, whichever limit is reached first.
- Use CodeGraph before reading or editing indexed source. Use `rtk` for shell
  commands and `apply_patch` for edits.
- Do not commit, reset, run a global autofix, or modify unrelated existing
  changes.
- Preserve runtime statements and runtime behaviour. Use `import type` and
  `export type` whenever the dependency is type-only.

Stop the batch and report to the coordinator instead of guessing if a fix
requires changing a lint rule, adding a public API, moving runtime logic,
choosing a new domain owner, or accepting a dependency cycle.

## Type-locality recipes

### TYPE-004: one concrete consumer

Move the declaration to its sole concrete consumer and make it non-exported.
Move any type-only imports required by the declaration. Remove the old import
from the consumer and remove the declaration from its dedicated type file.

If the sole consumer is another dedicated type file, move the declaration
there as a non-exported helper. Delete a type file only after it is empty and
has no remaining consumers. Never leave a compatibility re-export in the old
implementation file.

### TYPE-003: no external concrete consumer

Inspect symbol uses before editing:

- If the declaration supports another declaration in the same file, retain it
  without `export`.
- If it is used only by its implementation owner, place it in that
  implementation file without `export`.
- If it is genuinely unused, delete it and remove imports used only by it.

After every type batch, the selected diagnostics must disappear, no other
diagnostic category may increase, and no `TYPE-001` may appear.

## ARCH-019 recipes

Re-exports are allowed only at designated public APIs:

- `src/features/<feature>/index.ts`;
- package entrypoints explicitly named by that package's `package.json`.

For every forwarding export:

1. Identify the declaration's actual owner.
2. Update internal consumers to import directly from that owner.
3. If the symbol is public, export it directly from the designated entrypoint,
   preserving its public name and package/feature-root availability.
4. Remove the forwarding export.
5. Delete the forwarding file only if it is empty and has no consumers.

Do not create a replacement barrel. An implementation file containing runtime
logic may remain; remove only its forwarding exports. Imports through internal
paths are not public compatibility contracts.

## Validation and acceptance

After every batch run, in order:

1. `npm run typecheck`
2. `npm run check:type-locality`
3. ESLint on all changed files that still exist
4. `npm run lint`
5. `npm run check`

Until lint reaches zero, `npm run check` is expected to stop at its lint step,
but its preceding checks must pass. A batch is accepted only when typecheck
passes, the targeted count falls by the expected amount, no unrelated count
rises, no `TYPE-001` appears, and the diff stays within the assigned subsystem
plus necessary direct consumers.

At zero lint errors, `npm run check` must complete through typecheck, graph and
migration checks, lint, dead-code analysis, unit tests, build, and bundle
budget.

## Required batch report

Return:

- assigned and actually changed paths;
- diagnostic counts before and after, grouped by code/rule;
- validation commands and their exit status;
- files deleted or newly created;
- any unresolved risk, ambiguity, or reason the batch was stopped.

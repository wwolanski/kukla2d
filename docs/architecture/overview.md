# Architecture Overview

- Date: 2026-06-26
- Plan: 10, Etap 04

## High-Level Structure

```
src/
├── app/                    # Composition root (EditorLayout, providers)
├── features/               # Feature modules (public API or explicit lazy component entry)
│   ├── canvas/             # WebGL/Pixi viewport, gizmos, picking, mesh
│   ├── export/             # Export modal
│   ├── inspector/          # Per-type inspector fields
│   ├── layers/             # Layer management
│   ├── parameters/         # Parameter bindings
│   ├── physics/            # Physics rules UI
│   ├── preferences/        # Settings modal
│   ├── projects/           # Save/Load modals
│   ├── rigging/            # Bone creation, weight paint
│   └── timeline/           # Animation timeline
├── components/ui/          # Shared UI primitives (Radix + Tailwind)
├── app/hooks/              # Application-wide interaction hooks
├── app/providers/          # Root React providers
├── core/                   # Commands, project schema helpers
├── io/                     # Format I/O (PSD, Spine, Live2D, project files)
├── lib/                    # Utilities (uid, utils, immerPatches)
├── platform/               # Browser services (IndexedDB)
├── domain/                 # Shared domain helpers (transforms, animation engine)
├── runtime/                # Evaluation engine (skeleton, constraints, physics, mixer)
├── schema/                 # Project schema, migrations
├── store/                  # Zustand stores + undo history
└── shared/                 # (reserved for future shared code)
```

## Layer Rules

### src/app

Composition root. `EditorLayout.jsx` assembles panels and lazy modals. Does not contain domain logic.

### src/features/*

Each feature owns its components, application hooks, domain logic, and infrastructure. Stable public APIs are exported via `index.js` where present. Modal-only features may expose exact component paths for `React.lazy()` chunk boundaries. Features do not import each other's internals.

The mechanically enforced layer map uses `components/` and `overlays/` as the
UI layer. Dependencies point inward according to this matrix:

| FROM \\ TO | domain | application | infrastructure | UI (`components`, `overlays`) |
| --- | --- | --- | --- | --- |
| domain | YES | NO | NO | NO |
| application | YES | YES | NO | NO |
| infrastructure | YES | YES | YES | NO |
| UI | YES | YES | NO | YES |

Cross-feature access goes through `src/features/<target>/index.ts`; another
feature must not import the target's internal layer paths. A feature's root
`index.ts` is its business-facing public API and must not export
`infrastructure/`. The application composition root at `src/app/**` and the
feature-local wiring in `src/features/modular-sprite/composition/**` are
explicit composition areas, not additional domain/application/UI layers.

### src/components/ui

Shared UI primitives (Radix wrappers, Tailwind styled). No feature-specific logic.

### src/io, src/domain, src/runtime

Shared layers that remain in `src/`. Features import from these directly when needed.

### packages/*

Workspace contracts and adapters. Target for future extraction of `src/` layers.

## Forbidden Imports

1. **app must not import `@/components/<feature>`** — features are composed via `@/features/<feature>` / `@/features/<feature>/index.js` when a stable API exists, or by exact modal component path for documented lazy chunks.
2. **feature components must not import legacy `@/components/<feature>`** — use the feature's own `components/` directory.
3. **shared UI (`@/components/ui`) must not import feature internals** — shared UI is leaf-only, no upward dependencies.
4. **domain (`domain/**`) must not import React, Zustand, DOM, WebGL, or Worker** — domain is pure functions only.
5. **cross-feature imports must use `@/features/<owner>`** — direct imports of another feature's `application/`, `domain/`, `infrastructure/`, or `components/` internals are blocked by ESLint (`npm run lint`).

## Key Decisions

- Canvas renderer: PixiJS (sole runtime). See `canvas-renderer.md`.
- State: Provider-owned XState for workflow/tools/modes/sessions; Zustand for
  document and durable UI values; Immer patches for undo/redo. See
  `state-history.md`.
- Active animation path:
  `Timeline UI -> createTimelineCommandApi -> projectStore patch transaction -> animationStore session/tick -> evaluateEditorFramePose -> PixiSceneGateway.drawFrame`.
- Animation ownership:
  persisted clips/tracks/keyframes/audio belong to `projectStore`;
  active clip/session/playhead/loop window/draft pose belong to `animationStore`.
- Physics boundary:
  `evaluateEditorFramePose` builds pre-physics frame, physics adapter reads that
  frame and may return runtime overrides, then composer resolves final
  constraints/linking before Pixi render.
- `packages/engine` remains experimental and is not part of the active canvas path.
- Feature modals (Export, Save, Load, Preferences): lazy-loaded via `React.lazy()` to keep initial bundle small. See `bundle-budget.md`.
- IO modules (exportAnimation, live2d, psd, projectFile): dynamically imported at action time, not at app shell load.

## References

- `docs/architecture/canvas-renderer.md` — Canvas/Pixi renderer decisions and fallbacks
- `docs/architecture/state-history.md` — Zustand, XState, Immer history
- `docs/architecture/animation-runtime.md` — active animation/timeline/runtime path
- `docs/architecture/project-document.md` — document contracts (K1-K8), save/load, capture, preflight
- `docs/architecture/editor-mode-contract.md` — Staging/Animation mode contract, linked vs rig motion, length vs scale, feedback rules
- `docs/flows/codegraph-anchors.md` — Composition roots and named dynamic handoff anchors
- `docs/testing.md` — Test commands and when to use them
- `docs/architecture/bundle-budget.md` — Bundle budget decision

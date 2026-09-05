# Canvas Renderer ADR

## Decision

- **Pixi is the sole canvas render/input/overlay runtime.** Legacy WebGL2/SVG/DOM gesture paths have been removed.
- Selected renderer: `pixi.js` (8.19.0)
- Selected viewport/camera: `pixi-viewport` (6.0.3)
- React host: imperative adapter; DOM remains only for hosting Pixi canvas element, file input/drop UI, modals, and application layout. DOM does **not** serve as a canvas gesture or overlay runtime.
- One Provider-owned XState workflow actor is shared by Pixi runtime, toolbar
  and import UI. XState exclusively owns tools, modes, gesture session and
  import status.
- The configured `emitCommands` action maps each accepted event once to
  `EditorCommand` effects. Zustand stores only document and durable UI values.

### DOM Scope (Pixi-only)

| Allowed in DOM | Forbidden in DOM |
|---|---|
| Host element for Pixi `<canvas>` | Pointer gesture lifecycle for canvas |
| File input / drop zone UI | SVG/React overlay for canvas gestures |
| Modals, panels, toolbar, layout | Brush circle, marquee, gizmo handles, skeleton handles |

## Non Goals

- No Konva/Fabric migration
- No Three.js migration
- No project file format changes
- No rewrite of PSD import, mesh worker, export formats, or Zustand stores outside renderer integration

## Observable Success

- Pixi-only runtime: all canvas input, rendering, and overlays go through Pixi
- Geometry overlays (gizmo, skeleton, warp, weight, marquee, brush) render inside Pixi layer
- All quality gates pass: `npm run lint`, `npm run test:unit`, `npm run build`, `npm run check:deadcode`

## Mask Clipping

Iris/eyewhite clipping is implemented via explicit `clipToPartId` model-data field (Plan 14). The legacy name-based stencil clipping (`LEGACY_IRIS_CLIPPING_BLOCKED`) has been resolved and the legacy renderer has been fully removed.

## Final Status

- Date: 2026-06-30
- Target: **Pixi-only** — Pixi is the sole canvas render/input/overlay runtime
- Default backend: **Pixi** (`pixi.js` 8.19.0 + `pixi-viewport` 6.0.3)
- Legacy backend: **removed** (Plan 14, Stage 03)

### Quality Gates

| Command | Exit code | Result |
|---|---|---|
| `npm run lint` | 0 | PASS |
| `npm run test:unit` | 0 | PASS |
| `npm run build` | 0 | PASS |
| `npm run check:deadcode` | 0 | PASS |

## Public API

Canvas feature public export: `src/features/canvas/index.ts`

```js
import CanvasViewport from '@/features/canvas';
// or
import { CanvasViewport } from '@/features/canvas';
```

Stable workflow hooks and `EditorWorkflowContext` are exported by
`@/features/canvas`. Other internal `application/`, `domain`,
`infrastructure`, `overlays`, `config` and `testing` modules remain private.

### Pixi-only Runtime Contract

The Pixi-only runtime exposes a unified API via `PixiSceneGateway` and `PixiOverlayRenderer`:

- `PixiSceneGateway` — scene lifecycle, layer graph, frame rendering, capture, resource registry, overlay rendering, interaction system binding.
- `PixiOverlayRenderer` — renders gizmo, skeleton, warp lattice, weight paint, hover overlays entirely in Pixi containers.
- `EditorCommand` — workflow commands bridge XState decisions to Zustand/Pixi/import effects.
- `GestureComputationCache` — ephemeral per-session computation cache keyed by `session.id`; not persisted in machine context or store.

### Resource Swap Contract

Project load uses a staged `PixiResourceRegistry` created from the same Pixi app.
Textures, meshes and quad fallbacks upload into the staged registry while the
active registry remains attached to `PixiSceneGateway` and `PixiFrameRenderer`.
Commit swaps both references together through `swapResources`; only after that
does the importer dispose the previous registry. Failed staging disposes only the
staged registry and leaves the active renderer usable.

## Pixi Infrastructure Location

Pixi renderer infrastructure lives at:

```
src/features/canvas/infrastructure/rendering/pixi/
├── PixiSceneGateway.ts      # Pixi scene graph management
├── PixiOverlayRenderer.js   # Gizmo/skeleton/warp overlays
├── PixiInteractionSystem.ts # Pointer/keyboard → XState events
├── PixiResourceRegistry.ts  # Texture/mesh asset lifecycle
└── viewportCoordinates.ts   # Screen ↔ world coordinate bridge
```

## Validation Commands

- `npm run lint` — architecture boundaries and the Canvas feature file-size limit
- `npm run check:deadcode` — dead code detection (knip)

### Pixi Performance Metrics

- `PixiSceneGateway.measureStats()` → `PixiRuntimeStats` (pointer events, render count, GPU uploads, frame duration)
- `pixiPerformanceMetrics.ts` — pure domain helpers for counters and timing (dev/test-only)

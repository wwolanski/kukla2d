# Kukla2D

![Kukla2D logo](public/kukla2d.png)

<p align="center">
  <a href="https://github.com/wwolanski/Kukla2D/actions/workflows/ci.yml"><img src="https://github.com/wwolanski/Kukla2D/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <img src="https://img.shields.io/github/package-json/v/wwolanski/Kukla2D?style=flat" alt="version">
</p>

<h3 align="center">🌐 &nbsp;<a href="https://wwolanski.github.io/kukla2d">TRY IT LIVE</a>&nbsp; 🚀</h3>


Kukla2D is a local-first, browser-based editor for rigging and animating 2D characters. It combines an approachable workflow with mesh deformation, skeletal animation, constraints, physics, and game-ready export. It also works as a modular sprite processor and manager for building reusable character packages and AI-first asset workflows.

>[!WARNING]
> ***Version 0.9.3-beta** — Kukla2D's core editing workflow, project save/load, and primary export formats are functional and suitable for regular use. Some features remain experimental, and minor bugs or performance issues may still occur.*

## Highlights

- **Import & organize:** PSD layers auto-converted to scene nodes; PNG drag-and-drop; tree library with folders, reordering, and inline rename. Supports external `.scml` project files (Spriter Pro)
- **Mesh & rig authoring:** alpha-contour mesh generation, brush/vertex editing, bone drawing with Smart auto-assignment, weight painting with color-coded heatmaps, blend shapes, and warp deformers — all directly on canvas.
- **10 interactive tools:** Select, Transform, Mesh Deform/Adjust, Add/Remove Vertex, Paint Weights, Pose Rig, Draw Bone, Draw IK — with shortcuts, staging/animation modes, and policy-enforced tool restrictions.
- **Animation timeline:** dopesheet with per-target tracks, draggable keyframes, custom cubic-bezier easing, pose clipboard with mirroring, auto-keyframe recording, and boomerang targets.
- **Constraints:** IK (single/two-bone with FK blend), transform copy (per-channel, local/world), and path constraints (multi-point bezier) — all with mix control.
- **Physics:** Verlet particle system with gravity, wind, damping, and distance constraints; pendulum chain generator; physics rules editor with tag filtering; offline baking to keyframes.
- **Project management:** `.kk2d` format with schema migrations (v0.1→9), Zod validation, IndexedDB library, thumbnail gallery, and crash recovery.
- **Modular sprite workflow:** guided sprite-sheet importing with region detection, review, grouping, semantic-role assignment, mask touch-up, and reusable modular character packages.
- **Sprite processing:** automatic background detection for alpha and chroma-key sources, luminance-aware keying, silhouette-preserving mask cleanup, previews, caching, and persistent-worker progress/cancellation.
- **Schemas & generation:** local Schema Library with comparison, metadata, previews, compatible asset lookup, schema publication, and modular character generation or regeneration from Library assets.
- **Command line:** process modular sprites outside the editor and export the result, matte mask, and reusable recipe. Browser and CLI share the same processing configuration.

- **Export:** PNG sequences, spritesheets, and GIFs; [Phaser 4.2.1](https://phaser.io) baked texture atlas with `.atlas.json`, `.animations.json`, and TypeScript example; export area with preset resolutions. Experimental: Spine 4.0 JSON and Live2D Cubism 5.0.



## Screenshots

<img src="public/screenshot-editor.png" width="800" alt="Kukla2D editor">

## Quick start

Requirements: Node.js `>=24.18.0 <25` and npm `>=11.17.0 <12`.

```bash
git clone https://github.com/wwolanski/Kukla2D.git
cd Kukla2D
nvm install
nvm use
corepack npm ci
corepack npm run dev
```

`.nvmrc` selects the required Node.js version. `corepack npm` uses the exact
npm version pinned in `packageManager` (`npm@11.17.0`), so do not use
`npm install --global npm@11.17.0` for this project.

## Quality gates

```bash
npm run check          # types, lint, architecture, dead code, unit tests, build, bundle budget
npm run test:coverage  # enforced Vitest coverage thresholds
npm run test:e2e       # production build tested in Chromium
```

GitHub Actions runs these as separate quality, coverage, and E2E jobs. See [testing documentation](docs/testing.md) for focused commands.

## Architecture

Kukla2D uses feature-first modules around a pure domain/runtime core. [Zustand](https://github.com/pmndrs/zustand) owns document and durable UI state, [XState](https://github.com/statelyai/xstate) owns editor workflows, [Immer](https://github.com/immerjs/immer) patches power undo/redo, and [Zod](https://github.com/colinhacks/zod) validates persisted data.

```text
src/app             composition root
src/features        user-facing feature modules
src/domain          shared pure domain logic
src/runtime         animation, constraints, and physics evaluation
src/store           document, editor, and session state
src/platform        browser storage, resource lifecycle, and lazy adapters
packages            contracts, engine experiments, and format adapters
```

Start with the [documentation index](docs/README.md) and [architecture overview](docs/architecture/overview.md).

## License

[AGPLv3](LICENSE)

Third-party copyright and license notices are available in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

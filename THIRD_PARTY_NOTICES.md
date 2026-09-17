# Kukla2D — Copyright and Licensing Notice

## Kukla2D

Copyright © 2026 W. Wolanski

Kukla2D, as distributed in this repository beginning with version 0.9.3-beta, is licensed under the GNU Affero General Public License, version 3 or any later version (`AGPL-3.0-or-later`).

See [`LICENSE`](LICENSE) for the full GNU Affero General Public License version 3 text.

## Origin and attribution

Kukla2D began as a fork of [MangoLion/Stretchy Studio](https://github.com/MangoLion/stretchystudio), originally created by Nguyen Phan and distributed under the MIT License.

The current project retains and adapts several parts of that foundation:

* selected Radix/shadcn-style UI primitives, theme and preferences code, and parts of the original save/load screens;
* PSD parsing and organization concepts, mesh generation algorithms (contour sampling and Delaunay triangulation), and portions of the original transform and animation math, now typed and extended;
* portions of the Spine exporter and the experimental Live2D export toolchain.

Most application-level systems have since been replaced or substantially rebuilt, including:

* the rendering, interaction, picking, overlay, capture, and GPU-resource lifecycle built around PixiJS 8;
* the feature-first application architecture and module boundaries;
* project state, validation, migrations, workspace loading, IndexedDB persistence, autosave, and crash recovery;
* animation authoring and runtime evaluation, including skeletal posing, mesh skinning and warps, constraints, physics, timeline handling, easing, audio synchronization, and deterministic export;
* export pipelines for PNG sequences, spritesheets, GIF, and Phaser texture atlases;
* the project's TypeScript, testing, architecture-validation, CI, dead-code, and bundle-budget infrastructure.

## Stretchy Studio license notice

Portions of Kukla2D are derived from Stretchy Studio.

Copyright © 2026 Nguyen Phan

The original MIT License notice for those portions is reproduced below.

```text
MIT License

Copyright (c) 2026 Nguyen Phan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

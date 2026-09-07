/**
 * Export Area fit frame specs — R7 (Plan 34).
 *
 * Produces deterministic evaluated-bounds sample points per animation using
 * the animation's authored `fps` (cadence), sampling every tick strictly
 * below `duration`, plus the exact endpoint `duration` (deduplicated when it
 * lands on a cadence tick). Replaces the keyframe-only sampler in
 * `EditorLayout.handleFitCanvas` so interpolated rotation/deform between
 * keyframes is no longer skipped (P6).
 *
 * Output shape matches `computeEvaluatedExportBounds` frame specs:
 *   { animationId: string | null, timeMs: number }
 *
 * Pure domain: no React/Zustand/DOM/Pixi/Worker (C5).
 */

const STAGING_SAMPLE = Object.freeze([{ animationId: null, timeMs: 0 }]);

import type { ProjectDocument } from "@kukla2d/contracts";

import type { ExportBoundsFrameSpec } from "./exportAreaFitFrameSpecs.types.js";

function roundMs(t: number): number {
  return Math.round(t * 1000) / 1000;
}

function sampleAnimationTimes(durationMs: number, fps: number): number[] {
  const d = Number(durationMs);
  const f = Number(fps);
  if (!Number.isFinite(d) || d <= 0) return [0];
  if (!Number.isFinite(f) || f <= 0) return [0, d];

  const interval = 1000 / f;
  const times = [0];
  const maxFrame = Math.floor((d - 1e-9) / interval);
  for (let i = 1; i <= maxFrame; i += 1) {
    times.push(roundMs(i * interval));
  }
  const endpoint = roundMs(d);
  const last = times[times.length - 1];
  if (last === undefined || Math.abs(endpoint - last) > 1e-9) {
    times.push(endpoint);
  }
  return times;
}

export function buildExportAreaFitFrameSpecs(
  project: ProjectDocument | null | undefined,
  { animationId }: { animationId?: string } = {},
): readonly ExportBoundsFrameSpec[] {
  if (!project || typeof project !== "object") {
    return STAGING_SAMPLE;
  }
  const allAnimations = Array.isArray(project.animations)
    ? project.animations
    : [];
  const animations =
    animationId === undefined
      ? allAnimations
      : allAnimations.filter((animation) => animation?.id === animationId);
  if (animations.length === 0) {
    return STAGING_SAMPLE;
  }

  const specs: ExportBoundsFrameSpec[] = [];
  for (const animation of animations) {
    if (!animation || typeof animation !== "object") continue;
    const duration = animation.duration ?? 0;
    const fps = animation.fps ?? 30;
    for (const timeMs of sampleAnimationTimes(duration, fps)) {
      specs.push({ animationId: animation.id ?? null, timeMs });
    }
  }

  if (specs.length === 0) return STAGING_SAMPLE;
  return Object.freeze(specs);
}

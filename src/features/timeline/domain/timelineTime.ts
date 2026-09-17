import type { Animation } from "@kukla2d/contracts";

interface AnimationTimingChange {
  animationId: Animation["id"];
  durationMs: number;
  fps: number;
}

/** Frame number from time (ms) */
export function msToFrame(ms: number, fps: number): number {
  return Math.round((ms / 1000) * Math.max(1, fps));
}

/** Time (ms) from frame number */
export function frameToMs(frame: number, fps: number): number {
  return (frame / Math.max(1, fps)) * 1000;
}

/** Format milliseconds as seconds string */
export function formatMs(ms: number, decimals = 2): string {
  return (ms / 1000).toFixed(decimals);
}

export function buildFpsTimingChange(
  animation: Animation | null | undefined,
  fps: number,
): AnimationTimingChange | null {
  if (!animation) return null;
  const normalizedFps = Math.min(120, Math.max(1, Math.round(fps)));
  return {
    animationId: animation.id,
    durationMs: animation.duration,
    fps: normalizedFps,
  };
}

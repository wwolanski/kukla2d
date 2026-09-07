import type {
  Animation,
  AnimationId,
  AnimationTargetId,
  ProjectDocument,
} from "@kukla2d/contracts";

import { ANIMATION_DEFAULTS } from "./animationDefaults.js";
import { frameToTime } from "./animationTransport.js";

interface AnimationSession {
  activeAnimationId: AnimationId | null;
  currentTimeMs: number;
  playing: boolean;
  loop: boolean;
  loopStartFrame: number;
  loopEndFrame: number;
  speed: number;
  loopKeyframes: boolean;
  draftPose: Map<AnimationTargetId, Record<string, unknown>>;
}

/**
 * Pure animation session operations.
 *
 * Session state shape (K4):
 * {
 *   activeAnimationId: string | null,
 *   currentTimeMs: number,
 *   playing: boolean,
 *   loop: boolean,
 *   loopStartFrame: number,
 *   loopEndFrame: number,
 *   speed: number,
 *   loopKeyframes: boolean,
 *   draftPose: Map<string, Object>,
 * }
 *
 * No React, Zustand, DOM, WebGL, or Worker imports.
 */

function deriveLoopWindow(durationMs: number, fps: number) {
  const safeFps =
    Number.isFinite(fps) && fps > 0 ? fps : ANIMATION_DEFAULTS.fps;
  const duration =
    Number.isFinite(durationMs) && durationMs >= 0
      ? durationMs
      : (ANIMATION_DEFAULTS.frameCount / ANIMATION_DEFAULTS.fps) * 1000;
  return {
    startFrame: 0,
    endFrame: Math.max(1, Math.round((duration / 1000) * safeFps)),
  };
}

function clampSessionTiming(
  session: AnimationSession,
  fps: number,
): AnimationSession {
  const safeFps =
    Number.isFinite(fps) && fps > 0 ? fps : ANIMATION_DEFAULTS.fps;
  const startMs = frameToTime(session.loopStartFrame, safeFps);
  const endMs = frameToTime(
    Math.max(session.loopStartFrame + 1, session.loopEndFrame),
    safeFps,
  );

  let currentTimeMs = session.currentTimeMs;
  if (currentTimeMs < startMs) currentTimeMs = startMs;
  if (currentTimeMs > endMs) currentTimeMs = endMs;

  const { loopStartFrame } = session;
  let { loopEndFrame } = session;
  if (loopEndFrame <= loopStartFrame) {
    loopEndFrame = loopStartFrame + 1;
  }

  return {
    ...session,
    currentTimeMs,
    loopStartFrame,
    loopEndFrame,
  };
}

/**
 * Create initial session state from a clip.
 * Returns idle shape when clip is null/undefined.
 */
export function activateAnimationSession(
  clip: Animation | null | undefined,
): AnimationSession {
  if (!clip) return resetAnimationSession();

  const fps =
    Number.isFinite(clip.fps) && clip.fps > 0
      ? clip.fps
      : ANIMATION_DEFAULTS.fps;
  const { startFrame, endFrame } = deriveLoopWindow(clip.duration, fps);

  return {
    activeAnimationId: clip.id ?? null,
    currentTimeMs: 0,
    playing: false,
    loop: true,
    loopStartFrame: startFrame,
    loopEndFrame: endFrame,
    speed: 1,
    loopKeyframes: true,
    draftPose: new Map(),
  };
}

/**
 * Synchronize session timing when clip changes.
 * Clamps playhead and loop window to valid range.
 */
export function synchronizeAnimationSession(
  session: AnimationSession,
  clip: Animation | null | undefined,
): AnimationSession {
  if (!clip) return session;

  const fps =
    Number.isFinite(clip.fps) && clip.fps > 0
      ? clip.fps
      : ANIMATION_DEFAULTS.fps;
  const { startFrame, endFrame } = deriveLoopWindow(clip.duration, fps);

  const synchronized = {
    ...session,
    activeAnimationId: clip.id ?? session.activeAnimationId,
    loopStartFrame: startFrame,
    loopEndFrame: endFrame,
  };

  return clampSessionTiming(synchronized, fps);
}

/**
 * Reset session to idle/default state.
 */
export function resetAnimationSession(): AnimationSession {
  return {
    activeAnimationId: null,
    currentTimeMs: 0,
    playing: false,
    loop: true,
    loopStartFrame: 0,
    loopEndFrame: ANIMATION_DEFAULTS.frameCount,
    speed: ANIMATION_DEFAULTS.speed,
    loopKeyframes: true,
    draftPose: new Map<AnimationTargetId, Record<string, unknown>>(),
  };
}

/**
 * Select a stable snapshot of the session (K4 shape).
 */
export function selectAnimationSessionSnapshot(
  session: AnimationSession,
): AnimationSession {
  return {
    activeAnimationId: session.activeAnimationId,
    currentTimeMs: session.currentTimeMs,
    playing: session.playing,
    loop: session.loop,
    loopStartFrame: session.loopStartFrame,
    loopEndFrame: session.loopEndFrame,
    speed: session.speed,
    loopKeyframes: session.loopKeyframes,
    draftPose: session.draftPose,
  };
}

/**
 * Reconcile animation session with project state.
 * Used after load, undo/redo, or external document changes.
 *
 * @param {Object} project - canonical project with animations array
 * @param {Object} session - current session state (K4 shape)
 * @returns {Object} reconciled session (K4 shape)
 */
export function reconcileAnimationSession(
  project: ProjectDocument | null | undefined,
  session: AnimationSession,
): AnimationSession {
  const animations = project?.animations ?? [];
  const activeId = session.activeAnimationId;

  if (activeId != null) {
    const activeClip = animations.find((a) => a.id === activeId);
    if (activeClip) {
      return synchronizeAnimationSession(session, activeClip);
    }
  }

  if (animations.length > 0) {
    return activateAnimationSession(animations[0]);
  }

  return resetAnimationSession();
}

import { ANIMATION_DEFAULTS } from "./animationDefaults.js";

interface AnimationTransportState {
  currentTime: number;
  isPlaying: boolean;
  loop: boolean;
  fps: number;
  speed: number;
  startFrame: number;
  endFrame: number;
  lastTimestamp: number | null;
}

type AnimationTransportResult = AnimationTransportState & {
  advanced: boolean;
  loops?: number;
};

export function frameToTime(frame: number, fps: number): number {
  const safeFps =
    Number.isFinite(fps) && fps > 0 ? fps : ANIMATION_DEFAULTS.fps;
  return (Math.max(0, frame) / safeFps) * 1000;
}

export function sampleTimeAtFps(timeMs: number, fps: number): number {
  if (!Number.isFinite(timeMs)) return 0;
  if (!Number.isFinite(fps) || fps <= 0) return Math.max(0, timeMs);
  const frame = Math.floor((Math.max(0, timeMs) * fps) / 1000 + 1e-9);
  return frameToTime(frame, fps);
}

/**
 * Pure playback clock. Browser timestamps stay outside animation domain.
 * Returned state can be replayed in tests, export workers and offline renders.
 */
export function advanceAnimationTransport(
  state: AnimationTransportState,
  timestamp: number,
): AnimationTransportResult {
  if (!state.isPlaying) return { ...state, advanced: false };
  if (!Number.isFinite(timestamp)) return { ...state, advanced: false };

  const lastTimestamp = state.lastTimestamp;
  if (!Number.isFinite(lastTimestamp)) {
    return { ...state, lastTimestamp: timestamp, advanced: false };
  }

  const speed = Number.isFinite(state.speed) ? Math.max(0, state.speed) : 1;
  const deltaMs = Math.max(0, timestamp - (lastTimestamp ?? timestamp)) * speed;
  const startMs = frameToTime(state.startFrame, state.fps);
  const endMs = frameToTime(
    Math.max(state.startFrame + 1, state.endFrame),
    state.fps,
  );
  const rangeMs = endMs - startMs;

  if (deltaMs === 0 || rangeMs <= 0) {
    return { ...state, lastTimestamp: timestamp, advanced: false };
  }

  const currentTime = Math.max(
    startMs,
    Number.isFinite(state.currentTime) ? state.currentTime : startMs,
  );
  const candidate = currentTime + deltaMs;

  if (!state.loop && candidate >= endMs) {
    return {
      ...state,
      currentTime: endMs,
      isPlaying: false,
      lastTimestamp: null,
      advanced: true,
      loops: 0,
    };
  }

  if (state.loop && candidate >= endMs) {
    const loops = Math.floor((candidate - startMs) / rangeMs);
    return {
      ...state,
      currentTime: startMs + ((candidate - startMs) % rangeMs),
      lastTimestamp: timestamp,
      advanced: true,
      loops,
    };
  }

  return {
    ...state,
    currentTime: candidate,
    lastTimestamp: timestamp,
    advanced: true,
    loops: 0,
  };
}

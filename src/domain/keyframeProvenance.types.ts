import type { AnimationTargetId, Keyframe, Track } from "@kukla2d/contracts";

export interface KeyframeMatch {
  track: Track;
  keyframe: Keyframe;
  ref: { targetId: AnimationTargetId; timeMs: number; property?: string };
}

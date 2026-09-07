import type { AnimationId } from "@kukla2d/contracts";

export interface AnimationLayer {
  order: number;
  weight: number;
  mode: "override" | "additive";
  maskBoneIds?: ReadonlySet<string> | null;
  clipId: AnimationId | null;
  /** Mutable playback cursor owned by runtime instance. */
  time: number;
  timeScale: number;
  loop: boolean;
}

export interface RuntimeAnimationEvent {
  eventId: string;
  layerOrder: number;
  clipId: AnimationId;
  time: number;
}

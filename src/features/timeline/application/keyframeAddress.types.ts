import type { AnimationTargetId } from "@kukla2d/contracts";

export interface KeyframeAddress {
  targetId: AnimationTargetId;
  property: string;
  timeMs: number;
}

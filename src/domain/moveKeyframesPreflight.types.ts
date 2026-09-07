import type { AnimationTargetId } from "@kukla2d/contracts";

export type MoveKeyframesPreflightResult =
  | {
      valid: false;
      reasonCode: string;
      targetId?: AnimationTargetId;
      property?: string;
      timeMs?: number;
      duration?: number;
    }
  | {
      valid: true;
      targetFrameByAddress: Record<string, number>;
      deltaMs: number;
      minTime: number;
      maxTime: number;
    };
